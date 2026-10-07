import argon2 from 'argon2';
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://llmops:llmops_test_pw@127.0.0.1:15432/llmops';

async function seed() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const email = 'admin@vigilio.io';
  const password = 'Password123!';
  const displayName = 'Administrador Vigilio';

  console.log(`Hashing password with Argon2...`);
  const hash = await argon2.hash(password);

  console.log(`Upserting user ${email}...`);
  // 1. Upsert User
  let userRes = await client.query('SELECT id FROM users WHERE email = $1', [
    email,
  ]);
  let userId;
  if (userRes.rows.length === 0) {
    const insertRes = await client.query(
      `INSERT INTO users (email, display_name, email_verified)
       VALUES ($1, $2, true) RETURNING id`,
      [email, displayName],
    );
    userId = insertRes.rows[0].id;
  } else {
    userId = userRes.rows[0].id;
    await client.query(
      `UPDATE users SET email_verified = true, display_name = $2, disabled_at = NULL WHERE id = $1`,
      [userId, displayName],
    );
  }

  // 2. Upsert Credentials
  await client.query(
    `INSERT INTO user_credentials (user_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET password_hash = $2`,
    [userId, hash],
  );

  // 3. Complete Onboarding
  await client.query(
    `INSERT INTO user_onboarding (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  // 4. Upsert Organization
  const orgSlug = 'vigilio-enterprise';
  const orgName = 'Vigilio Enterprise';
  let orgRes = await client.query(
    'SELECT id FROM organizations WHERE slug = $1',
    [orgSlug],
  );
  let orgId;
  if (orgRes.rows.length === 0) {
    const insOrg = await client.query(
      `INSERT INTO organizations (slug, name, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [orgSlug, orgName, userId],
    );
    orgId = insOrg.rows[0].id;
  } else {
    orgId = orgRes.rows[0].id;
  }

  // 5. Upsert Membership
  await client.query(
    `INSERT INTO memberships (organization_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner'`,
    [orgId, userId],
  );

  // 6. Upsert Workspaces
  const workspaces = [
    { slug: 'production', name: 'Producción' },
    { slug: 'staging', name: 'Staging Lab' },
  ];
  for (const ws of workspaces) {
    await client.query(
      `INSERT INTO workspaces (organization_id, slug, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, slug) DO UPDATE SET name = $3`,
      [orgId, ws.slug, ws.name],
    );
  }

  await client.end();
  console.log('--------------------------------------------------');
  console.log('✅ Demo account seeded successfully!');
  console.log(`Email    : ${email}`);
  console.log(`Password : ${password}`);
  console.log(`Org      : ${orgName} (${orgSlug})`);
  console.log('--------------------------------------------------');
}

seed().catch((err) => {
  console.error('Failed to seed demo user:', err);
  process.exit(1);
});
