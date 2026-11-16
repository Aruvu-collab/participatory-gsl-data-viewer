-- Show who mapped a feature, when, and their notes, in approved and pending popups.
-- Approved views gain submitted_at + notes; the pending view gains author_name + notes.
-- "create or replace view" only allows appending columns, so they go last.
-- After running: in GeoServer, open each of the four layers and use
-- "Reload feature type" so the new attribute is published.

begin;

create or replace view contrib.one_approved_patches as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         ST_Multi(geom)::geometry(MultiPolygon,4326) as geom, project, submitted_at, notes
  from contrib.one_submissions where status='approved' and layer='one_patches';

create or replace view contrib.one_approved_lines as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         ST_Multi(geom)::geometry(MultiLineString,4326) as geom, project, submitted_at, notes
  from contrib.one_submissions where status='approved' and layer='one_lines';

create or replace view contrib.one_approved_points as
  select id, one_class, subtype, one_state, tags, local_name, author_name,
         geom::geometry(Point,4326) as geom, project, submitted_at, notes
  from contrib.one_submissions where status='approved' and layer='one_points';

create or replace view contrib.one_pending_public as
  select id, layer, one_class, subtype, submitted_at, geom, project, author_name, notes
  from contrib.one_submissions where status='pending';

commit;
