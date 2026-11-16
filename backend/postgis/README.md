# PostGIS for PGSL contributions

On the GeoServer host (wherever GeoServer's docker-compose.yml lives):

1. Copy this folder next to it, `cp .env.example .env`, and fill in long random passwords
   (`openssl rand -base64 24`).
2. Start it from inside this folder, so the relative paths and `.env` resolve here:
   `cd postgis && docker compose -f docker-compose.postgis.yml up -d`
   Check that the setup script ran: `docker logs postgis 2>&1 | grep 01_contrib`
3. Attach GeoServer to the network: in GeoServer's compose file add `networks: [gisnet]` to the geoserver service,
   and `networks: { gisnet: { external: true } }` at the bottom. Then `docker compose up -d` in GeoServer's folder.
4. Check it: `docker exec -it postgis psql -U pgsl_admin -d pgsl -c '\dt contrib.*'`
5. In GeoServer (workspace `grasslands`), add two PostGIS stores, both with host `postgis`, port 5432, database `pgsl`, schema `contrib`:
   - `contrib_rw`, user `gs_contrib_rw`. Publish `one_submissions`.
   - `contrib_ro`, user `gs_contrib_ro`. Publish the `one_approved_*` and `one_pending_public` views.
6. Reviewers connect from QGIS through `ssh -L 5432:localhost:5432 user@server`, then use host `localhost`, user `reviewer`.

`initdb/` only runs on an empty volume. To change the schema later, write migration SQL and run it with psql.
Backups are written to `./backups` every day. Copy them off the server too (rsync or restic to Nextcloud).
