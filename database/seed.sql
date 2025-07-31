-- Insert default scopes
INSERT INTO oauth_scopes (scope_name) VALUES 
    ('openid'),
    ('offline_access'),
    ('email'),
    ('profile');

-- Insert default admin user (password: admin123)
-- bcrypt hash for 'admin123' with salt rounds 12
INSERT INTO admins (email, password_hash, handle_name, display_name) VALUES 
    ('admin@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeGJmr5v6VnzWYr9i', 'admin', 'System Administrator');