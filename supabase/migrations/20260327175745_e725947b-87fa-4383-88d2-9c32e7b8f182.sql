-- Create a SECURITY DEFINER function to check conversation participation
-- This breaks the RLS recursion between conversations and conversation_participants
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = _user_id
  )
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can view co-participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;

-- Recreate conversations SELECT policy using the helper function (no recursion)
CREATE POLICY "Users can view own conversations"
ON public.conversations FOR SELECT TO authenticated
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND is_conversation_participant(id, auth.uid())
);

-- Recreate conversations UPDATE policy
CREATE POLICY "Participants can update conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND is_conversation_participant(id, auth.uid())
);

-- Recreate conversation_participants SELECT using the helper (no self-reference)
CREATE POLICY "Participants can view co-participants"
ON public.conversation_participants FOR SELECT TO authenticated
USING (
  is_conversation_participant(conversation_id, auth.uid())
);

-- Recreate messages SELECT policy
CREATE POLICY "Participants can view messages"
ON public.messages FOR SELECT TO authenticated
USING (
  is_conversation_participant(conversation_id, auth.uid())
);

-- Recreate messages INSERT policy
CREATE POLICY "Participants can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND is_conversation_participant(conversation_id, auth.uid())
);