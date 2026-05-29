import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deliverAndLog } from '../_shared/delivery.ts'
import { AuthError } from '../_shared/cors.ts'
import { withCors, json, jsonError } from '../_shared/handler.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function adminClient() {
  return createClient(supabaseUrl, serviceRoleKey)
}

async function getAuthUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new AuthError('No authorization header', 401)
  const token = authHeader.replace('Bearer ', '')
  const supabase = adminClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new AuthError('Invalid token', 401)
  return user
}

async function requirePlatformOwner(req: Request) {
  const user = await getAuthUser(req)
  const supabase = adminClient()
  const { data } = await supabase
    .from('platform_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'platform_owner')
    .maybeSingle()
  if (!data) throw new AuthError('Not a platform owner', 403)
  return { user, supabase }
}

async function logAudit(supabase: any, actorId: string, action: string, targetType: string, targetId?: string | null, details?: any) {
  await supabase.from('platform_audit_log').insert({
    actor_id: actorId, action, target_type: targetType,
    target_id: targetId || null, details: details || {}
  })
}

Deno.serve(withCors(async (req) => {
    const body = await req.json()
    const { action, ...params } = body

    // Bootstrap: first platform owner (no existing owners required)
    if (action === 'bootstrap') {
      const user = await getAuthUser(req)
      const supabase = adminClient()
      const { data: existing } = await supabase
        .from('platform_roles')
        .select('id')
        .eq('role', 'platform_owner')
        .limit(1)

      if (existing && existing.length > 0) {
        return jsonError('Platform owner already exists. Use promote instead.', 400)
      }

      await supabase.from('platform_roles').insert({ user_id: user.id, role: 'platform_owner' })
      await logAudit(supabase, user.id, 'bootstrap', 'platform', null, { email: user.email })
      return json({ success: true })
    }

    // Seed by email: requires service_role key
    if (action === 'seed_by_email') {
      const authHeader = req.headers.get('Authorization')
      const token = authHeader?.replace('Bearer ', '')
      if (token !== serviceRoleKey) {
        return jsonError('Service role key required', 403)
      }
      const supabase = adminClient()
      const { email } = params
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle()
      if (!profile) return jsonError('User not found', 404)

      await supabase.from('platform_roles').upsert(
        { user_id: profile.id, role: 'platform_owner' },
        { onConflict: 'user_id,role' }
      )
      await logAudit(supabase, profile.id, 'seed_platform_owner', 'platform', profile.id, { email })
      return json({ success: true, user_id: profile.id })
    }

    // All remaining actions require platform_owner role
    const { user, supabase } = await requirePlatformOwner(req)

    switch (action) {
      case 'promote': {
        const { user_id } = params
        if (!user_id) return jsonError('user_id is required', 400)
        const { data: targetProfile } = await supabase.from('profiles').select('id').eq('id', user_id).maybeSingle()
        if (!targetProfile) return jsonError('User not found', 404)
        await supabase.from('platform_roles').upsert(
          { user_id, role: 'platform_owner', granted_by: user.id },
          { onConflict: 'user_id,role' }
        )
        await logAudit(supabase, user.id, 'promote_platform_owner', 'user', user_id)
        return json({ success: true })
      }

      case 'demote': {
        const { user_id } = params
        if (user_id === user.id) return jsonError('Cannot demote yourself', 400)
        const { data: allOwners } = await supabase
          .from('platform_roles')
          .select('id')
          .eq('role', 'platform_owner')
        if (!allOwners || allOwners.length <= 1) {
          return jsonError('Cannot demote the last platform owner', 400)
        }
        await supabase.from('platform_roles').delete().eq('user_id', user_id).eq('role', 'platform_owner')
        await logAudit(supabase, user.id, 'demote_platform_owner', 'user', user_id)
        return json({ success: true })
      }

      case 'agency.update': {
        const { agency_id, ...fields } = params
        if (!agency_id) return jsonError('agency_id is required', 400)
        const { data: targetAgency } = await supabase.from('agencies').select('id, agency_status').eq('id', agency_id).maybeSingle()
        if (!targetAgency) return jsonError('Agency not found', 404)
        const allowed = ['agency_status', 'plan_type', 'billing_model', 'payment_terms',
          'contract_start_date', 'contract_end_date', 'feature_flags', 'platform_notes']
        const updateData: Record<string, any> = {}
        for (const f of allowed) {
          if (fields[f] !== undefined) updateData[f] = fields[f]
        }

        // Detect approval: status changing to 'active'
        const isApproval = updateData.agency_status === 'active'
        let previousStatus: string | null = null
        if (isApproval) {
          const { data: currentAgency } = await supabase.from('agencies')
            .select('agency_status, name')
            .eq('id', agency_id)
            .single()
          previousStatus = currentAgency?.agency_status || null

          // Set approved_at and approved_by
          if (previousStatus === 'pending_approval') {
            updateData.approved_at = new Date().toISOString()
            updateData.approved_by = user.id
          }
        }

        const { error } = await supabase.from('agencies').update(updateData).eq('id', agency_id)
        if (error) throw error
        await logAudit(supabase, user.id, 'update_agency', 'agency', agency_id, updateData)

        // Send approval notification email to agency admin
        if (isApproval && previousStatus === 'pending_approval') {
          try {
            const { data: agencyData } = await supabase.from('agencies')
              .select('name').eq('id', agency_id).single()
            const { data: adminRole } = await supabase.from('user_roles')
              .select('user_id')
              .eq('agency_id', agency_id)
              .eq('role', 'agency_admin')
              .limit(1)
              .maybeSingle()

            if (adminRole) {
              const { data: adminProfile } = await supabase.from('profiles')
                .select('email, first_name')
                .eq('id', adminRole.user_id)
                .single()

              if (adminProfile?.email) {
                const agencyName = agencyData?.name || 'Your agency'
                const firstName = adminProfile.first_name || 'there'
                const siteUrl = Deno.env.get('SITE_URL') || 'https://app.bluethreadsolution.com'

                const bodyText = `Hi ${firstName},\n\nGreat news — ${agencyName} has been approved and is now active on BlueThread Solution.\n\nYou can log in and start using the platform right away:\n${siteUrl}/login\n\nIf you have any questions, reply to this email or contact support@bluethreadsolution.com.\n\nWelcome aboard!`

                await deliverAndLog(supabase, {
                  agency_id,
                  channel: 'email',
                  recipient: adminProfile.email,
                  subject: `${agencyName} has been approved — you're all set!`,
                  body: bodyText,
                  related_entity_type: 'agency',
                  related_entity_id: agency_id,
                })

                await logAudit(supabase, user.id, 'send_approval_email', 'agency', agency_id, {
                  recipient: adminProfile.email,
                })
              }
            }
          } catch (emailErr: any) {
            console.error('Failed to send approval email:', emailErr.message)
            await logAudit(supabase, user.id, 'approval_email_failed', 'agency', agency_id, {
              error: emailErr.message,
            })
          }
        }

        return json({ success: true })
      }

      case 'billing_config.upsert': {
        const { agency_id, config_id, billing_model, per_appointment_fee, monthly_base_fee,
          included_appointments, overage_rate, usage_billing_trigger,
          plan_name, setup_fee, min_monthly_fee, max_monthly_fee,
          notes: billingNotes, is_active, effective_start_date, effective_end_date } = params

        const configData: Record<string, any> = {
          agency_id,
          billing_model: billing_model || 'per_appointment',
          per_appointment_fee: per_appointment_fee ?? 0,
          monthly_base_fee: monthly_base_fee ?? 0,
          included_appointments: included_appointments ?? 0,
          overage_rate: overage_rate ?? 0,
          usage_billing_trigger: usage_billing_trigger || 'completed',
          plan_name: plan_name ?? '',
          setup_fee: setup_fee ?? 0,
          min_monthly_fee: min_monthly_fee ?? 0,
          max_monthly_fee: max_monthly_fee ?? 0,
          notes: billingNotes ?? '',
          is_active: is_active ?? true,
          effective_start_date: effective_start_date || new Date().toISOString().slice(0, 10),
          effective_end_date: effective_end_date || null,
        }

        if (config_id) {
          const { error } = await supabase.from('platform_billing_config')
            .update(configData).eq('id', config_id)
          if (error) throw error
        } else {
          const startDate = configData.effective_start_date
          await supabase.from('platform_billing_config')
            .update({ effective_end_date: startDate })
            .eq('agency_id', agency_id)
            .is('effective_end_date', null)
            .lt('effective_start_date', startDate)

          const { error } = await supabase.from('platform_billing_config')
            .insert(configData)
          if (error) throw error
        }

        await logAudit(supabase, user.id, 'upsert_billing_config', 'agency', agency_id, configData)
        return json({ success: true })
      }

      case 'billing_config.get': {
        const { agency_id } = params
        const { data: config } = await supabase.from('platform_billing_config')
          .select('*')
          .eq('agency_id', agency_id)
          .lte('effective_start_date', new Date().toISOString().slice(0, 10))
          .or(`effective_end_date.is.null,effective_end_date.gte.${new Date().toISOString().slice(0, 10)}`)
          .order('effective_start_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        return json({ config })
      }

      case 'billing_config.list': {
        const { agency_id } = params
        const { data: configs } = await supabase.from('platform_billing_config')
          .select('*')
          .eq('agency_id', agency_id)
          .order('effective_start_date', { ascending: false })
        return json({ configs: configs || [] })
      }

      case 'platform_usage.summary': {
        const { agency_id, billing_month } = params
        const month = billing_month || new Date().toISOString().slice(0, 7)

        const [usageResult, configResult] = await Promise.all([
          supabase.from('platform_usage_log')
            .select('*')
            .eq('agency_id', agency_id)
            .eq('billing_month', month),
          supabase.from('platform_billing_config')
            .select('*')
            .eq('agency_id', agency_id)
            .lte('effective_start_date', new Date().toISOString().slice(0, 10))
            .or(`effective_end_date.is.null,effective_end_date.gte.${new Date().toISOString().slice(0, 10)}`)
            .order('effective_start_date', { ascending: false })
            .limit(1)
            .maybeSingle()
        ])

        const usage = usageResult.data || []
        const config = configResult.data
        const totalUsage = usage.length
        const totalFees = usage.reduce((s: number, u: any) => s + Number(u.fee_amount || 0), 0)
        const included = config?.included_appointments || 0
        const overage = Math.max(0, totalUsage - included)
        const overageRate = Number(config?.overage_rate || 0)
        const overageCost = overage * overageRate
        const monthlyBase = Number(config?.monthly_base_fee || 0)
        const minFee = Number(config?.min_monthly_fee || 0)
        const maxFee = Number(config?.max_monthly_fee || 0)

        let subtotal = monthlyBase + totalFees + overageCost
        if (minFee > 0 && subtotal < minFee) subtotal = minFee
        if (maxFee > 0 && subtotal > maxFee) subtotal = maxFee

        return json({
          month, total_appointments: totalUsage, total_fees: totalFees,
          included_appointments: included, overage_count: overage,
          overage_cost: overageCost, monthly_base_fee: monthlyBase,
          min_monthly_fee: minFee, max_monthly_fee: maxFee,
          min_applied: minFee > 0 && (monthlyBase + totalFees + overageCost) < minFee,
          cap_applied: maxFee > 0 && (monthlyBase + totalFees + overageCost) > maxFee,
          grand_total: subtotal,
          trigger_type: config?.usage_billing_trigger || 'completed',
        })
      }

      case 'agency.appointments': {
        const { agency_id, filter } = params
        let query = supabase.from('appointments')
          .select('id, title, status, scheduled_start, scheduled_end, modality, patient_client_name, created_at, customer:customers(name), interpreter:profiles!appointments_interpreter_id_fkey(first_name, last_name), language:languages(name)')
          .eq('agency_id', agency_id)
          .eq('is_deleted', false)
          .order('scheduled_start', { ascending: false })
          .limit(200)

        if (filter === 'completed') {
          query = query.in('status', ['completed', 'validated', 'billed'])
        } else if (filter === 'this_month') {
          const now = new Date()
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
          const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
          query = query.gte('scheduled_start', startOfMonth).lte('scheduled_start', endOfMonth)
        }

        const { data: appointments, error: apptErr } = await query
        if (apptErr) throw apptErr
        return json({ appointments: appointments || [] })
      }

      case 'agency.customers': {
        const { agency_id } = params
        const { data: customers, error: custErr } = await supabase.from('customers')
          .select('id, name, contact_name, contact_email, is_active, created_at')
          .eq('agency_id', agency_id)
          .eq('is_deleted', false)
          .order('name')
          .limit(500)
        if (custErr) throw custErr
        return json({ customers: customers || [] })
      }

      case 'agency.usage_records': {
        const { agency_id, date_from, date_to } = params
        let query = supabase.from('platform_usage_log')
          .select('id, appointment_id, trigger_type, triggered_status, fee_amount, billing_month, created_at')
          .eq('agency_id', agency_id)
          .order('created_at', { ascending: false })
          .limit(500)

        if (date_from) query = query.gte('created_at', date_from)
        if (date_to) query = query.lte('created_at', date_to)

        const { data: records, error: recErr } = await query
        if (recErr) throw recErr
        return json({ records: records || [] })
      }

      case 'user.disable': {
        const { user_id } = params
        if (!user_id) return jsonError('user_id is required', 400)
        const { data: targetUser } = await supabase.from('profiles').select('id, is_active').eq('id', user_id).maybeSingle()
        if (!targetUser) return jsonError('User not found', 404)
        if (!targetUser.is_active) return jsonError('User is already disabled', 400)
        await supabase.from('profiles').update({ is_active: false }).eq('id', user_id)
        await logAudit(supabase, user.id, 'disable_user', 'user', user_id)
        return json({ success: true })
      }

      case 'user.enable': {
        const { user_id } = params
        if (!user_id) return jsonError('user_id is required', 400)
        const { data: targetUser } = await supabase.from('profiles').select('id, is_active').eq('id', user_id).maybeSingle()
        if (!targetUser) return jsonError('User not found', 404)
        if (targetUser.is_active) return jsonError('User is already enabled', 400)
        await supabase.from('profiles').update({ is_active: true }).eq('id', user_id)
        await logAudit(supabase, user.id, 'enable_user', 'user', user_id)
        return json({ success: true })
      }

      case 'user.reset_password': {
        const { email } = params
        const { error } = await supabase.auth.admin.generateLink({ type: 'recovery', email })
        if (error) throw error
        await logAudit(supabase, user.id, 'force_password_reset', 'user', null, { email })
        return json({ success: true })
      }

      case 'user.remove_from_agency': {
        const { user_id } = params
        await supabase.from('user_roles').delete().eq('user_id', user_id)
        await supabase.from('profiles').update({ agency_id: null }).eq('id', user_id)
        await logAudit(supabase, user.id, 'remove_user_from_agency', 'user', user_id)
        return json({ success: true })
      }

      case 'support.start': {
        const { agency_id, reason } = params
        await supabase.from('support_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('platform_user_id', user.id)
          .is('ended_at', null)
        const { data: session, error } = await supabase
          .from('support_sessions')
          .insert({ platform_user_id: user.id, agency_id, reason })
          .select('id')
          .single()
        if (error) throw error
        await supabase.from('profiles').update({ agency_id }).eq('id', user.id)
        await supabase.from('user_roles').upsert(
          { user_id: user.id, role: 'agency_admin', agency_id },
          { onConflict: 'user_id,role' }
        )
        await logAudit(supabase, user.id, 'start_support_session', 'agency', agency_id, { reason, session_id: session.id })
        return json({ success: true, session_id: session.id, agency_id })
      }

      case 'support.end': {
        const { session_id } = params
        const { data: sess } = await supabase
          .from('support_sessions')
          .select('platform_user_id, agency_id')
          .eq('id', session_id)
          .single()
        if (sess) {
          await supabase.from('user_roles')
            .delete()
            .eq('user_id', sess.platform_user_id)
            .eq('role', 'agency_admin')
            .eq('agency_id', sess.agency_id)
          await supabase.from('profiles')
            .update({ agency_id: null })
            .eq('id', sess.platform_user_id)
        }
        await supabase.from('support_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', session_id)
        await logAudit(supabase, user.id, 'end_support_session', 'support_session', session_id)
        return json({ success: true })
      }

      default:
        return jsonError('Unknown action', 400)
    }
}))
