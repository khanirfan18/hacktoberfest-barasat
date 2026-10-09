import fs from 'node:fs';

// Load .env.local if not already in process.env
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  } else if (fs.existsSync('../.env.local')) {
    process.loadEnvFile('../.env.local');
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceKey) {
  console.error('Missing Supabase environment variables in .env.local');
  process.exit(1);
}

export async function verifySupabase(table = 'gyms') {
  console.log(`Checking Supabase connection to: ${supabaseUrl}`);

  // 1. Service key verification on root OpenAPI endpoint
  let servicePass = false;
  try {
    const resService = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });
    servicePass = resService.status === 200;
    console.log(`[Service Key] GET /rest/v1/: status ${resService.status} -> ${servicePass ? 'PASS' : 'FAIL'}`);
  } catch (err) {
    console.error(`[Service Key] Error: ${err.message}`);
  }

  // 2. Anon key verification on table endpoint with limit query
  // Testing an individual table endpoint avoids the 401 root OpenAPI restriction
  let anonPass = false;
  let anonDetail = '';
  try {
    const tableUrl = `${supabaseUrl}/rest/v1/${table}?limit=1`;
    const resAnon = await fetch(tableUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (resAnon.status === 200) {
      anonPass = true;
      anonDetail = '200 OK (table exists & accessible)';
    } else if (resAnon.status === 404) {
      const body = await resAnon.json().catch(() => ({}));
      if (body.code === 'PGRST205') {
        // Authenticated successfully by Supabase gateway & PostgREST; table not yet created
        anonPass = true;
        anonDetail = 'Authenticated successfully (PostgREST schema cache miss: PGRST205)';
      } else {
        anonDetail = `404: ${JSON.stringify(body)}`;
      }
    } else if (resAnon.status === 401) {
      anonPass = false;
      anonDetail = '401 Unauthorized (Invalid API key)';
    } else {
      anonDetail = `Status ${resAnon.status}`;
    }

    console.log(`[Anon Key] GET /rest/v1/${table}?limit=1: status ${resAnon.status} -> ${anonPass ? 'PASS' : 'FAIL'} (${anonDetail})`);
  } catch (err) {
    console.error(`[Anon Key] Error: ${err.message}`);
  }

  const overallPass = servicePass && anonPass;
  console.log(`\nSupabase anon/service verification: ${overallPass ? 'PASS' : 'FAIL'}`);
  return { servicePass, anonPass, overallPass };
}

// Run directly when executed
if (import.meta.url === `file://${process.argv[1]}`) {
  const table = process.argv[2] || 'gyms';
  verifySupabase(table).then(({ overallPass }) => {
    process.exit(overallPass ? 0 : 1);
  });
}
