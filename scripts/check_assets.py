import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
conn = psycopg2.connect('postgresql://postgres:EqnGlCVFOtVhPVAvdlPcojEGKCTbVmlF@interchange.proxy.rlwy.net:33523/railway')
cur = conn.cursor()

# Check rental_properties columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='rental_properties' ORDER BY ordinal_position")
cols = [r[0] for r in cur.fetchall()]
print('rental_properties columns:', cols)

# Test the exact query that the assets API does
cur.execute("""
    SELECT a.id, a.name, a.asset_type, a.updated_at,
           rp.id, rp.name, rp.address, rp.building_name, rp.unit_no, rp.status
    FROM assets a
    LEFT JOIN rental_properties rp ON rp.id = a.rental_property_id
    ORDER BY a.updated_at DESC
""")
print('\nAssets query result:')
for r in cur.fetchall():
    print(' ', r)

conn.close()
