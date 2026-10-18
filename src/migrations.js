// Database migrations. The first version of the project had only `users` and `items`
// (one image per item, free-text category and color); these steps extend that schema
// in place so existing accounts and reports keep working.
const db = require("./db");
const { CATEGORIES, COLORS, normalizeCategory, normalizeColor } = require("./taxonomy");

const columnExists = async (table, column) =>
  !!(await db.one(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  ));

const indexExists = async (table, index) =>
  !!(await db.one(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    [table, index]
  ));

async function addColumns(table, columns) {
  for (const [name, def] of Object.entries(columns)) {
    if (!(await columnExists(table, name))) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}

const MIGRATIONS = [
  {
    id: "001_original_schema",
    async up() {
      await db.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await db.query(`CREATE TABLE IF NOT EXISTS items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        type ENUM('lost', 'found') NOT NULL,
        title VARCHAR(200) NOT NULL,
        category VARCHAR(100) NULL,
        color VARCHAR(50) NULL,
        description TEXT NOT NULL,
        location_name VARCHAR(255) NULL,
        latitude DECIMAL(10, 7) NULL,
        longitude DECIMAL(10, 7) NULL,
        image VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    },
  },
  {
    id: "002_accounts_and_reports",
    async up() {
      await addColumns("users", {
        full_name: "VARCHAR(120) NULL AFTER username",
        role: "ENUM('user','admin') NOT NULL DEFAULT 'user'",
        status: "ENUM('active','suspended') NOT NULL DEFAULT 'active'",
        phone: "VARCHAR(40) NULL",
        notify_prefs: "JSON NULL",
        last_login_at: "DATETIME NULL",
      });
      await addColumns("items", {
        brand: "VARCHAR(100) NULL AFTER color",
        event_date: "DATE NULL AFTER description",
        status: "ENUM('pending_review','active','resolved','returned','closed','removed') NOT NULL DEFAULT 'active'",
        is_valuable: "TINYINT(1) NOT NULL DEFAULT 0",
        private_details: "TEXT NULL",
        moderation_note: "VARCHAR(255) NULL",
        views: "INT NOT NULL DEFAULT 0",
        updated_at: "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
      });
      if (!(await indexExists("items", "ft_items_text")))
        await db.query("ALTER TABLE items ADD FULLTEXT INDEX ft_items_text (title, description, brand)");
      if (!(await indexExists("items", "idx_items_status_type")))
        await db.query("ALTER TABLE items ADD INDEX idx_items_status_type (status, type, created_at)");

      await db.query(`CREATE TABLE IF NOT EXISTS item_photos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        filename VARCHAR(100) NOT NULL,
        width INT NULL,
        height INT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        embedding BLOB NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

      // Old free-text values → fixed slugs; the single image column → item_photos.
      const items = await db.query("SELECT id, category, color, image, created_at FROM items");
      for (const item of items) {
        await db.query("UPDATE items SET category = ?, color = ?, event_date = COALESCE(event_date, DATE(?)) WHERE id = ?", [
          normalizeCategory(item.category),
          normalizeColor(item.color),
          item.created_at,
          item.id,
        ]);
        if (item.image) {
          const exists = await db.one("SELECT 1 FROM item_photos WHERE item_id = ?", [item.id]);
          if (!exists) await db.query("INSERT INTO item_photos (item_id, filename) VALUES (?, ?)", [item.id, item.image]);
        }
      }
    },
  },
  {
    id: "003_workflow_tables",
    async up() {
      const charset = "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";
      await db.query(`CREATE TABLE IF NOT EXISTS saved_items (
        user_id INT NOT NULL,
        item_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS matches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lost_item_id INT NOT NULL,
        found_item_id INT NOT NULL,
        score TINYINT UNSIGNED NOT NULL,
        reasons JSON NOT NULL,
        status ENUM('suggested','confirmed','dismissed','disputed') NOT NULL DEFAULT 'suggested',
        lost_response ENUM('pending','yes','no') NOT NULL DEFAULT 'pending',
        found_response ENUM('pending','yes','no') NOT NULL DEFAULT 'pending',
        admin_note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_match_pair (lost_item_id, found_item_id),
        FOREIGN KEY (lost_item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (found_item_id) REFERENCES items(id) ON DELETE CASCADE
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS claims (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        claimant_id INT NOT NULL,
        kind ENUM('ownership','finder') NOT NULL,
        match_id INT NULL,
        message TEXT NOT NULL,
        proof TEXT NULL,
        status ENUM('pending','under_review','approved','rejected','returned','cancelled') NOT NULL DEFAULT 'pending',
        requires_admin TINYINT(1) NOT NULL DEFAULT 0,
        owner_approved TINYINT(1) NOT NULL DEFAULT 0,
        disputed TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_claims_item (item_id, status),
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS claim_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        claim_id INT NOT NULL,
        actor_id INT NULL,
        from_status VARCHAR(20) NULL,
        to_status VARCHAR(20) NOT NULL,
        note VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        claim_id INT NOT NULL,
        sender_id INT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('match','claim','status','message','system') NOT NULL,
        title VARCHAR(200) NOT NULL,
        body VARCHAR(500) NULL,
        link VARCHAR(255) NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user (user_id, is_read, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS email_outbox (
        id INT AUTO_INCREMENT PRIMARY KEY,
        to_email VARCHAR(150) NOT NULL,
        subject VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        sent_at DATETIME NULL,
        error VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS flags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reporter_id INT NULL,
        target_type ENUM('item','user','claim','match') NOT NULL,
        target_id INT NOT NULL,
        reason ENUM('spam','fake','offensive','scam','privacy','other') NOT NULL,
        details VARCHAR(1000) NULL,
        status ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
        resolved_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_flags_status (status, created_at),
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_id INT NULL,
        action VARCHAR(60) NOT NULL,
        target_type VARCHAR(20) NULL,
        target_id INT NULL,
        details JSON NULL,
        ip VARCHAR(45) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_created (created_at),
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
      ) ${charset}`);

      await db.query(`CREATE TABLE IF NOT EXISTS settings (
        name VARCHAR(60) PRIMARY KEY,
        value VARCHAR(255) NOT NULL
      ) ${charset}`);
      await db.query("INSERT IGNORE INTO settings (name, value) VALUES ('moderation_mode', 'post')");
    },
  },
  {
    id: "004_languages",
    async up() {
      await addColumns("users", { lang: "VARCHAR(2) NOT NULL DEFAULT 'en'" });
      await addColumns("notifications", { tkey: "VARCHAR(40) NULL AFTER type", params: "JSON NULL AFTER tkey" });
    },
  },
];

async function migrate({ log = console.log } = {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(80) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  const done = new Set((await db.query("SELECT id FROM schema_migrations")).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    log(`• migration ${m.id}`);
    await m.up();
    await db.query("INSERT INTO schema_migrations (id) VALUES (?)", [m.id]);
  }
}

module.exports = { migrate, CATEGORIES, COLORS };
