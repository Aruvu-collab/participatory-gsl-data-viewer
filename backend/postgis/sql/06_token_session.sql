-- Editing sessions: while someone has Contribute open, their browser tab checks in
-- every 30 seconds with its invite code. This lets the dashboard show, for the code
-- in use, its session name, how many edits were made with it, and how many people
-- are editing with it right now. (There is no 05: an earlier draft was replaced by this file.)
-- Run:
--   docker exec -i postgis psql -U pgsl_admin -d pgsl -v ON_ERROR_STOP=1 < sql/06_token_session.sql

begin;

-- One row per open browser tab per code; rows older than 2 minutes are removed.
create table if not exists contrib.token_presence (
  token     text not null references contrib.tokens(token) on delete cascade,
  client_id uuid not null,
  last_seen timestamptz not null default now(),
  primary key (token, client_id)
);

create index if not exists one_submissions_token_idx on contrib.one_submissions(token);

-- p_leave = true when the tab closes or leaves Contribute, so the live count drops at once.
create or replace function api.token_session(
  p_project text, p_token text, p_client uuid, p_leave boolean default false
) returns json
language plpgsql volatile security definer
set search_path = contrib, public
as $$
declare
  t        contrib.tokens;
  reason   text;
  n_live   int;
  n_edits  int;
  n_pend   int;
  n_appr   int;
begin
  select * into t from contrib.tokens where token = upper(trim(p_token)) and project = p_project;
  if not found then
    return json_build_object('valid', false, 'reason', 'This invite code is not valid for this map');
  end if;

  reason := case
    when t.revoked then 'This invite code has been withdrawn'
    when t.expires_at is not null and t.expires_at <= now() then 'This invite code has expired'
    when t.max_uses is not null and t.uses >= t.max_uses then 'This invite code has been used up'
  end;
  if reason is not null then
    delete from contrib.token_presence where token = t.token;
    return json_build_object('valid', false, 'reason', reason);
  end if;

  delete from contrib.token_presence where last_seen < now() - interval '2 minutes';
  if p_leave then
    delete from contrib.token_presence where token = t.token and client_id = p_client;
  else
    insert into contrib.token_presence (token, client_id) values (t.token, p_client)
    on conflict (token, client_id) do update set last_seen = now();
  end if;

  select count(*) into n_live from contrib.token_presence
   where token = t.token and last_seen > now() - interval '75 seconds';

  select count(*),
         count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'approved')
    into n_edits, n_pend, n_appr
    from contrib.one_submissions where token = t.token;

  return json_build_object(
    'valid', true,
    'reason', null,
    'label', t.label,
    'expires_at', t.expires_at,
    'uses', t.uses,
    'max_uses', t.max_uses,
    'allowed_layers', t.allowed_layers,
    'live', n_live,
    'edits', n_edits,
    'pending', n_pend,
    'approved', n_appr
  );
end $$;

revoke all on function api.token_session(text, text, uuid, boolean) from public;
grant execute on function api.token_session(text, text, uuid, boolean) to web_writer;

commit;

notify pgrst, 'reload schema';
