#!/bin/sh
set -e

echo ""
echo "================================================"
echo "  Poultry Vet Distribution System"
echo "================================================"
echo ""
echo "Waiting for database..."

# Wait up to 60 seconds for PostgreSQL to accept connections
RETRIES=30
until node -e "
  const { Pool } = require('pg');
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  p.query('SELECT 1').then(() => { p.end(); process.exit(0); }).catch(() => { p.end(); process.exit(1); });
" 2>/dev/null || [ $RETRIES -eq 0 ]; do
  echo "  Database not ready yet, retrying..."
  sleep 2
  RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
  echo "ERROR: Database did not become ready in time. Check Docker logs."
  exit 1
fi

echo "Database ready. Applying schema..."
PRISMA_CLIENT_ENGINE_TYPE=wasm npx prisma db push --skip-generate 2>&1 | grep -v "^$" || true

echo ""
echo "================================================"
echo "  Ready! Open your browser:"
echo "  http://localhost:3000"
echo "================================================"
echo ""

exec npx next start -H 0.0.0.0 -p 3000
