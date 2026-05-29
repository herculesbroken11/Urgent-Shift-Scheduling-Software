DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;

CREATE POLICY "Users can view own conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND (
    created_by = auth.uid()
    OR is_conversation_participant(id, auth.uid())
  )
);