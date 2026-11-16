-- Multi-project support for contributions.
-- Each dashboard page (slug) is a "project" with its own mapping area. Tokens belong to one project,
-- and submissions record their project. States/classes are no longer fixed in the database:
-- they come from each project's taxonomy and are checked by the dashboard server route.
--
-- Run once on the server (from the folder holding this file):
--   docker exec -i postgis psql -U pgsl_admin -d pgsl -v ON_ERROR_STOP=1 < 03_projects.sql
--   docker restart postgrest
-- Then in GeoServer, for each of one_approved_patches / _lines / _points / one_pending_public:
--   Layers -> <layer> -> Data tab -> "Reload feature type" -> Save   (so it sees the new "project" column)

begin;

-- Projects ---------------------------------------------------------------------
create table if not exists contrib.projects (
  slug   text primary key,
  name   text not null,
  bounds geometry(Polygon, 4326) not null
);
insert into contrib.projects (slug, name, bounds)
values ('crc-bidar-grasslands', 'CRC - Grasslands of Bidar', ST_MakeEnvelope(76.7, 17.5, 77.8, 18.5, 4326))
on conflict (slug) do nothing;

-- Submissions: project column; states are checked per project by the dashboard ---------
alter table contrib.one_submissions add column if not exists project text;
update contrib.one_submissions set project = 'crc-bidar-grasslands' where project is null;
alter table contrib.one_submissions alter column project set not null;
create index if not exists one_submissions_project_idx on contrib.one_submissions (project);
alter table contrib.one_submissions drop constraint if exists one_submissions_one_state_check;

-- Tokens belong to one project ---------------------------------------------------
alter table contrib.tokens add column if not exists project text;
update contrib.tokens set project = 'crc-bidar-grasslands' where project is null;
alter table contrib.tokens alter column project set not null;

drop function if exists contrib.new_token(text, int, int, text[]);
-- select contrib.new_token('crc-bidar-grasslands', 'Bidar workshop Nov', 200, 14);
create or replace function contrib.new_token(p_project text, p_label text, p_max_uses int default null,
                                             p_days int default 30, p_layers text[] default null)
returns text language sql as $$
  insert into contrib.tokens(token, project, label, max_uses, expires_at, allowed_layers)
  values (upper(substr(translate(encode(gen_random_bytes(12), 'base64'), '+/=', ''), 1, 12)),
          p_project, p_label, p_max_uses,
          case when p_days is null then null else now() + make_interval(days => p_days) end,
          p_layers)
  returning token;
$$;

-- Published views: add "project" at the end (create or replace allows appending columns) ----
create or replace view contrib.one_approved_patches as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         ST_Multi(geom)::geometry(MultiPolygon,4326) as geom, project
  from contrib.one_submissions where status='approved' and layer='one_patches';
create or replace view contrib.one_approved_lines as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         ST_Multi(geom)::geometry(MultiLineString,4326) as geom, project
  from contrib.one_submissions where status='approved' and layer='one_lines';
create or replace view contrib.one_approved_points as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         geom::geometry(Point,4326) as geom, project
  from contrib.one_submissions where status='approved' and layer='one_points';
create or replace view contrib.one_pending_public as
  select id, layer, one_class, subtype, submitted_at, geom, project
  from contrib.one_submissions where status='pending';

-- API: submit now takes the project ------------------------------------------------
drop function if exists api.submit(text, text, json, text, text, text, json, text, text, text);

create function api.submit(
  p_project text, p_token text, p_layer text, p_geojson json,
  p_one_class text, p_subtype text default null, p_one_state text default null,
  p_tags json default '{}', p_local_name text default null, p_notes text default null,
  p_author_name text default null
) returns json
language plpgsql security definer
set search_path = contrib, public
as $$
declare
  t      contrib.tokens;
  area   geometry;
  g      geometry;
  new_id bigint;
begin
  select bounds into area from contrib.projects where slug = p_project;
  if not found then
    raise exception 'Unknown project' using errcode = 'PT400';
  end if;

  -- Token: must belong to this project; check and count the use in one statement.
  -- Any later error rolls back the whole call, including this use.
  update contrib.tokens
     set uses = uses + 1, last_used_at = now()
   where token = p_token
     and project = p_project
     and not revoked
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
     and (allowed_layers is null or p_layer = any(allowed_layers))
  returning * into t;
  if not found then
    raise exception 'Invite code is invalid or expired' using errcode = 'PT403';
  end if;

  if (select count(*) from contrib.one_submissions
       where token = p_token and submitted_at > now() - interval '1 hour') >= t.hourly_limit then
    raise exception 'Too many submissions, try again later' using errcode = 'PT429';
  end if;

  if coalesce(trim(p_author_name), '') = '' then
    raise exception 'Author name is required' using errcode = 'PT400';
  end if;
  g := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  if not ST_Within(g, area) then
    raise exception 'Feature is outside the mapping area' using errcode = 'PT400';
  end if;

  insert into contrib.one_submissions
    (project, layer, geom, one_class, subtype, one_state, tags,
     local_name, notes, author_name, token, source)
  values
    (p_project, p_layer, g, p_one_class, p_subtype, p_one_state, coalesce(p_tags, '{}')::text,
     left(trim(p_local_name), 200), left(trim(p_notes), 1000), left(trim(p_author_name), 120),
     p_token, 'web_token')
  returning id into new_id;

  return json_build_object('id', new_id);
end $$;

revoke all on function api.submit(text, text, text, json, text, text, text, json, text, text, text) from public;
grant execute on function api.submit(text, text, text, json, text, text, text, json, text, text, text) to web_writer;

commit;

-- Tell PostgREST to reload its schema cache (the restart above also does this).
notify pgrst, 'reload schema';
