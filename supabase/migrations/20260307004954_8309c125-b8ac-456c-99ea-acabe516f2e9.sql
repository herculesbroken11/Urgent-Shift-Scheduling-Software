
-- Fix: user_id FK must point to profiles (not auth.users) for PostgREST joins
ALTER TABLE public.customer_requestors
  DROP CONSTRAINT customer_requestors_user_id_fkey;

ALTER TABLE public.customer_requestors
  ADD CONSTRAINT customer_requestors_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
