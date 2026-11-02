CREATE TABLE IF NOT EXISTS public.cart_items (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    product_id VARCHAR(50) NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    size VARCHAR(10) NOT NULL,
    color VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    is_ai_recommended BOOLEAN DEFAULT FALSE, -- Cổng chờ đánh dấu size do AI gợi ý
    ai_fit_note VARCHAR(100) DEFAULT NULL,   -- Ghi chú độ vừa vặn từ AI (nếu có)
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cart_items_unique_variant UNIQUE (user_id, product_id, size, color)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items(user_id);
