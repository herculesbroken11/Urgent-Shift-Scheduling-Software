import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withCors, json, jsonError } from '../_shared/handler.ts'

Deno.serve(withCors(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { email, redirectTo } = await req.json()
    if (!email) {
      return jsonError('Email required', 400)
    }

    const requestOrigin = req.headers.get('origin')
    const resolvedRedirectTo = redirectTo || new URL('/reset-password', requestOrigin ?? 'https://bluethreadsolutions.lovable.app').toString()

    const results: Record<string, unknown> = { email }

    // Step 1: Check if auth user exists — use getUserByEmail instead of listUsers
    let userId: string
    // Paginated lookup to handle >1000 users
    let existingUser: any = null;
    let page = 1;
    const perPage = 1000;
    while (!existingUser) {
      const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
      if (listErr || !listData?.users?.length) break;
      existingUser = listData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) || null;
      if (listData.users.length < perPage) break;
      page++;
    }

    if (existingUser) {
      userId = existingUser.id
      results.auth_user = 'already_exists'
    } else {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: resolvedRedirectTo,
        },
      })
      console.log('generateLink result:', JSON.stringify({ data: linkData ? 'ok' : null, error: linkError }))

      if (linkError) throw new Error(`Failed to create user: ${linkError.message}`)

      userId = linkData.user.id
      results.auth_user = 'created_via_invite'
      results.setup_url = linkData.properties?.action_link || null
    }

    results.user_id = userId

    // Step 2: Ensure profile row exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (existingProfile) {
      results.profile = 'already_exists'
    } else {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: userId, email, first_name: 'Platform', last_name: 'Admin', is_active: true })
      if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`)
      results.profile = 'created'
    }

    // Step 3: Upsert platform_owner role
    const { error: roleError } = await supabase
      .from('platform_roles')
      .upsert({ user_id: userId, role: 'platform_owner' }, { onConflict: 'user_id,role' })
    if (roleError) throw new Error(`Failed to set platform role: ${roleError.message}`)
    results.platform_role = 'platform_owner_set'

    // Step 4: Audit log
    await supabase.from('platform_audit_log').insert({
      actor_id: userId,
      action: 'seed_platform_owner',
      target_type: 'platform',
      target_id: userId,
      details: { email, method: 'seed-platform-owner' }
    })
    results.audit_logged = true

    // Step 5: If user already existed, generate a recovery link for password reset
    if (existingUser) {
      const { data: recoveryData, error: recoveryError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: resolvedRedirectTo,
        },
      })
      if (!recoveryError && recoveryData) {
        results.setup_url = recoveryData.properties?.action_link || null
        results.recovery = 'link_generated'
      }
    }

    // Step 6: Verify
    const { data: verifyRole } = await supabase
      .from('platform_roles')
      .select('id, role')
      .eq('user_id', userId)
      .eq('role', 'platform_owner')
      .maybeSingle()

    const { data: verifyProfile } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userId)
      .maybeSingle()

    results.verified = {
      auth_user_exists: true,
      profile_exists: !!verifyProfile,
      profile_email: verifyProfile?.email,
      platform_role_exists: !!verifyRole,
      can_access_platform_dashboard: !!verifyRole,
    }

    results.redirect_to = resolvedRedirectTo
    results.next_steps = 'Use the setup_url to set a password and activate the account. After login, the Platform Console link will appear in the sidebar.'
    results.requires_login = true

    return json(results)
}))
