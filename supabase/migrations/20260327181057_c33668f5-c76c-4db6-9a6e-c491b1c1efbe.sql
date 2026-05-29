-- Add foreign key from messages.sender_id to profiles.id so PostgREST can resolve the join
ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id);
