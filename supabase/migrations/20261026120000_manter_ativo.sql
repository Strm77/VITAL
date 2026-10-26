-- V.I.T.A.L — "despertador": a Vercel chama esta função todo dia (cron em vercel.json)
-- para o projeto não ser pausado por inatividade no plano gratuito do Supabase.
-- Só devolve a hora do banco; não lê nenhuma tabela.
create or replace function public.manter_ativo()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.manter_ativo() from public;
grant execute on function public.manter_ativo() to anon, authenticated;
