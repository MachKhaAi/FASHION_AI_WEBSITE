CREATE TABLE IF NOT EXISTS public.body_measurements (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    height INT NULL,               -- Chiều cao (cm)
    weight NUMERIC(5,2) NULL,      -- Cân nặng (kg)
    chest INT NULL,                -- Vòng ngực (cm)
    waist INT NULL,                -- Vòng eo (cm)
    hip INT NULL,                  -- Vòng hông (cm)
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);