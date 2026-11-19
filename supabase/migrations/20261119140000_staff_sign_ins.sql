-- Staff sign-ins for owners (v0.7.3, SC-005).
-- When each staff member last signed in, so an owner can tell whether a newly added owner or editor
-- has got in. Only owners see it. Only this one value leaves the auth schema: no addresses, tokens
-- or other account details. Other callers get no rows rather than an error, so the desk can ask for
-- it whenever it shows the staff list.

create function app.staff_sign_ins()
returns table (principal_id uuid, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.last_sign_in_at
  from app.principals p
  join auth.users u on u.id = p.auth_user_id
  where p.kind = 'human'
    and app.has_staff_role('owner')
$$;

comment on function app.staff_sign_ins() is
  'Owners only: when each human principal last signed in (null if never). Other callers get no rows.';

revoke all on function app.staff_sign_ins() from public, anon, authenticated, service_role, desk_agent, desk_publisher;
grant execute on function app.staff_sign_ins() to authenticated;
