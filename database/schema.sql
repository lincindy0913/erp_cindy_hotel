-- 進銷存暨營運決策分析系統 - 資料庫 Schema
-- PostgreSQL 資料庫結構定義

-- ============================================
-- 主資料層 (10-19)
-- ============================================

-- 產品主檔
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    unit VARCHAR(20),
    cost_price DECIMAL(10, 2) NOT NULL CHECK (cost_price >= 0),
    sales_price DECIMAL(10, 2) NOT NULL CHECK (sales_price >= 0),
    is_in_stock BOOLEAN DEFAULT FALSE,
    warehouse_location VARCHAR(50) CHECK (warehouse_location IN ('麗格', '麗軒', '民宿')),
    accounting_subject VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_warehouse_when_in_stock CHECK (
        (is_in_stock = FALSE) OR (is_in_stock = TRUE AND warehouse_location IS NOT NULL)
    )
);

-- 廠商資料
CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    contact VARCHAR(255),
    payment_terms VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 客戶資料
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    contact VARCHAR(255),
    credit_limit DECIMAL(12, 2) NOT NULL CHECK (credit_limit >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 進貨模組 (20-29)
-- ============================================

-- 進貨主檔
CREATE TABLE purchase_masters (
    id SERIAL PRIMARY KEY,
    purchase_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    purchase_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    tax DECIMAL(12, 2) NOT NULL CHECK (tax >= 0),
    status VARCHAR(20) DEFAULT '待入庫' CHECK (status IN ('待入庫', '已入庫', '已取消')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 進貨明細
CREATE TABLE purchase_details (
    id SERIAL PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchase_masters(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    sub_total DECIMAL(12, 2) NOT NULL CHECK (sub_total >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 銷貨模組 (30-39)
-- ============================================

-- 銷貨主檔
CREATE TABLE sales_masters (
    id SERIAL PRIMARY KEY,
    sales_no VARCHAR(50) UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    sales_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    tax DECIMAL(12, 2) NOT NULL CHECK (tax >= 0),
    invoice_no VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT '待出貨' CHECK (status IN ('待出貨', '已出貨', '已取消')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 銷貨明細
CREATE TABLE sales_details (
    id SERIAL PRIMARY KEY,
    sales_id INTEGER NOT NULL REFERENCES sales_masters(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    sub_total DECIMAL(12, 2) NOT NULL CHECK (sub_total >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 財務模組 (40-49)
-- ============================================

-- 付款紀錄
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    sales_id INTEGER NOT NULL REFERENCES sales_masters(id),
    payment_no VARCHAR(50) UNIQUE NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('現金', '轉帳', '支票', '信用卡')),
    amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 庫存模組 (50-59)
-- ============================================

-- 即時庫存
CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER UNIQUE NOT NULL REFERENCES products(id),
    beginning_qty INTEGER NOT NULL DEFAULT 0,
    purchase_qty INTEGER NOT NULL DEFAULT 0,
    sales_qty INTEGER NOT NULL DEFAULT 0,
    current_qty INTEGER NOT NULL GENERATED ALWAYS AS (beginning_qty + purchase_qty - sales_qty) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 分析模組 (60-89)
-- ============================================

-- 歷史進貨價格
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    purchase_date DATE NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 比價分析
CREATE TABLE price_comparisons (
    product_id INTEGER NOT NULL REFERENCES products(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    date DATE NOT NULL,
    PRIMARY KEY (product_id, supplier_id, date)
);

-- 部門支出
CREATE TABLE department_expenses (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    department VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    tax DECIMAL(12, 2) NOT NULL CHECK (tax >= 0),
    total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 儀表板資料
CREATE TABLE dashboard_data (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    indicator_type VARCHAR(50) NOT NULL CHECK (indicator_type IN ('進貨總額', '銷貨總額', '毛利', '毛利潤率')),
    amount DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 索引建立
-- ============================================

-- 主資料層索引
CREATE INDEX idx_products_code ON products(code);
CREATE INDEX idx_products_is_in_stock ON products(is_in_stock);
CREATE INDEX idx_suppliers_code ON suppliers(code);
CREATE INDEX idx_customers_code ON customers(code);

-- 進貨模組索引
CREATE INDEX idx_purchase_masters_supplier ON purchase_masters(supplier_id);
CREATE INDEX idx_purchase_masters_date ON purchase_masters(purchase_date);
CREATE INDEX idx_purchase_details_product ON purchase_details(product_id);

-- 銷貨模組索引
CREATE INDEX idx_sales_masters_customer ON sales_masters(customer_id);
CREATE INDEX idx_sales_masters_date ON sales_masters(sales_date);
CREATE INDEX idx_sales_details_product ON sales_details(product_id);

-- 財務模組索引
CREATE INDEX idx_payments_sales ON payments(sales_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- 庫存模組索引
CREATE INDEX idx_inventory_current_qty ON inventory(current_qty);

-- 分析模組索引
CREATE INDEX idx_price_history_product ON price_history(product_id);
CREATE INDEX idx_price_history_date ON price_history(purchase_date);
CREATE INDEX idx_department_expenses_year_month ON department_expenses(year, month);
CREATE INDEX idx_dashboard_data_year_month ON dashboard_data(year, month);

-- ============================================
-- 觸發器：自動更新庫存
-- ============================================

-- 當進貨明細新增時，自動更新庫存
CREATE OR REPLACE FUNCTION update_inventory_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory
    SET purchase_qty = purchase_qty + NEW.quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = NEW.product_id;
    
    -- 記錄歷史價格
    INSERT INTO price_history (supplier_id, product_id, purchase_date, unit_price)
    SELECT pm.supplier_id, NEW.product_id, pm.purchase_date, NEW.unit_price
    FROM purchase_masters pm
    WHERE pm.id = NEW.purchase_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_purchase
AFTER INSERT ON purchase_details
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_purchase();

-- 當銷貨明細新增時，自動更新庫存
CREATE OR REPLACE FUNCTION update_inventory_on_sales()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory
    SET sales_qty = sales_qty + NEW.quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE product_id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_sales
AFTER INSERT ON sales_details
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_sales();

-- ============================================
-- 視圖：應收帳款報表
-- ============================================

CREATE VIEW accounts_receivable AS
SELECT 
    sm.id AS sales_id,
    sm.sales_no,
    c.name AS customer_name,
    sm.amount AS total_amount,
    COALESCE(SUM(p.amount), 0) AS paid_amount,
    sm.amount - COALESCE(SUM(p.amount), 0) AS receivable_amount,
    CASE 
        WHEN COALESCE(SUM(p.amount), 0) >= sm.amount THEN '已結清'
        WHEN COALESCE(SUM(p.amount), 0) > 0 THEN '部分付款'
        ELSE '未付款'
    END AS payment_status
FROM sales_masters sm
LEFT JOIN customers c ON sm.customer_id = c.id
LEFT JOIN payments p ON sm.id = p.sales_id
GROUP BY sm.id, sm.sales_no, c.name, sm.amount;

-- ============================================
-- 視圖：庫存總覽
-- ============================================

CREATE VIEW inventory_overview AS
SELECT 
    i.id,
    p.code AS product_code,
    p.name AS product_name,
    p.category,
    i.beginning_qty,
    i.purchase_qty,
    i.sales_qty,
    i.current_qty,
    CASE 
        WHEN i.current_qty < 0 THEN '庫存不足'
        WHEN i.current_qty < 10 THEN '偏低'
        WHEN i.current_qty > 1000 THEN '過多'
        ELSE '正常'
    END AS inventory_status
FROM inventory i
JOIN products p ON i.product_id = p.id;

-- ============================================
-- 視圖：月度儀表板
-- ============================================

CREATE VIEW monthly_dashboard AS
SELECT 
    year,
    month,
    SUM(CASE WHEN indicator_type = '進貨總額' THEN amount ELSE 0 END) AS purchase_total,
    SUM(CASE WHEN indicator_type = '銷貨總額' THEN amount ELSE 0 END) AS sales_total,
    SUM(CASE WHEN indicator_type = '毛利' THEN amount ELSE 0 END) AS profit,
    SUM(CASE WHEN indicator_type = '毛利潤率' THEN amount ELSE 0 END) AS profit_margin
FROM dashboard_data
GROUP BY year, month;

