import { supabase } from "@/integrations/supabase/client";

export type AppRole = 'agency_admin' | 'scheduler' | 'requester' | 'interpreter';

export interface UserProfile {
  id: string;
  agency_id: string | null;
  customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface UserRole {
  role: AppRole;
  agency_id: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data as UserProfile;
}

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, agency_id')
    .eq('user_id', userId);
  if (error) return [];
  return data as UserRole[];
}

export async function createAgencyWithAdmin(
  userId: string,
  agencyName: string,
  agencySlug: string,
  firstName: string,
  lastName: string,
  planType: string = 'starter',
  agencyStatus: string = 'active'
) {
  const { data, error } = await (supabase as any).rpc('bootstrap_agency_admin', {
    _agency_name: agencyName,
    _agency_slug: agencySlug,
    _first_name: firstName,
    _last_name: lastName,
    _plan_type: planType,
    _agency_status: agencyStatus,
  });

  if (error) throw error;

  return data;
}
