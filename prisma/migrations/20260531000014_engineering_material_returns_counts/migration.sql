-- CreateTable engineering_material_returns
CREATE TABLE IF NOT EXISTS engineering_material_returns (
    id          SERIAL NOT NULL,
    project_id  INTEGER NOT NULL,
    material_id INTEGER,
    product_id  INTEGER,
    description VARCHAR(500),
    quantity    DECIMAL(12, 4) NOT NULL,
    unit        VARCHAR(20),
    return_date VARCHAR(20) NOT NULL,
    reason      VARCHAR(500),
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    note        TEXT,
    created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT engineering_material_returns_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS engineering_material_returns_project_id_idx
    ON engineering_material_returns(project_id);
CREATE INDEX IF NOT EXISTS engineering_material_returns_material_id_idx
    ON engineering_material_returns(material_id);

DO $$ BEGIN
  ALTER TABLE engineering_material_returns
    ADD CONSTRAINT engineering_material_returns_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES engineering_projects(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE engineering_material_returns
    ADD CONSTRAINT engineering_material_returns_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES engineering_materials(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable engineering_stock_counts
CREATE TABLE IF NOT EXISTS engineering_stock_counts (
    id         SERIAL NOT NULL,
    project_id INTEGER NOT NULL,
    count_date VARCHAR(20) NOT NULL,
    counter    VARCHAR(100),
    status     VARCHAR(20) NOT NULL DEFAULT 'draft',
    note       TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT engineering_stock_counts_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS engineering_stock_counts_project_id_idx
    ON engineering_stock_counts(project_id);

DO $$ BEGIN
  ALTER TABLE engineering_stock_counts
    ADD CONSTRAINT engineering_stock_counts_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES engineering_projects(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable engineering_stock_count_items
CREATE TABLE IF NOT EXISTS engineering_stock_count_items (
    id           SERIAL NOT NULL,
    count_id     INTEGER NOT NULL,
    material_id  INTEGER,
    description  VARCHAR(500),
    unit         VARCHAR(20),
    expected_qty DECIMAL(12, 4) NOT NULL,
    actual_qty   DECIMAL(12, 4) NOT NULL,
    note         TEXT,

    CONSTRAINT engineering_stock_count_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS engineering_stock_count_items_count_id_idx
    ON engineering_stock_count_items(count_id);
CREATE INDEX IF NOT EXISTS engineering_stock_count_items_material_id_idx
    ON engineering_stock_count_items(material_id);

DO $$ BEGIN
  ALTER TABLE engineering_stock_count_items
    ADD CONSTRAINT engineering_stock_count_items_count_id_fkey
    FOREIGN KEY (count_id) REFERENCES engineering_stock_counts(id) ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE engineering_stock_count_items
    ADD CONSTRAINT engineering_stock_count_items_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES engineering_materials(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
