# auth

Сессии (`sid` cookie, в БД только SHA-256 токена), Argon2id, RBAC-гард, login/logout.
Rate limit и lockout — in-memory на процесс (не общий между инстансами).
