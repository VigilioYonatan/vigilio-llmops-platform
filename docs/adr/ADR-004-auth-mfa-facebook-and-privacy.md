# ADR-004: Autenticación Cookie HttpOnly + CSRF, MFA Anti-Replay, Facebook OAuth Seguro y Eliminación Meta

- **Estado:** Accepted
- **Fecha:** 2026-11-09
- **Decisores:** Vigilio LLMOps Architecture

## Decisión
1. **Sesiones y MFA:** Cookies `HttpOnly` + `SameSite=Lax` + `Secure` (prefijo `__Host-` en HTTPS) con doble envío CSRF (`X-CSRF-Token`) y verificación de `Origin`. `SessionGuard`, `refresh` y `FacebookService.callback` verifican siempre `users.disabled_at IS NULL`. Si una cuenta tiene MFA activo, el callback de Facebook emite un challenge MFA (`mfa_required`) en lugar de sesión directa.
2. **Defensa Anti-Replay TOTP:** `verifyTotp` retorna el paso exacto consumido (`matchedStep` en `[T-1, T, T+1]`) y actualiza atómicamente `mfa_factors.last_step` impidiendo reutilizar códigos dentro o entre ventanas adyacentes. Se habilita `POST /api/v1/me/mfa/step-up` para operaciones sensibles.
3. **Vinculación y Eliminación Meta:** jamás se auto-vincula una identidad social por coincidencia de email; la vinculación exige sesión autenticada + `POST /api/v1/me/identities/facebook/link` devolviendo `{ authorization_url }` JSON para navegación segura sin fallos CORS/CSP. El webhook `POST /api/v1/webhooks/facebook/data-deletion` valida firma HMAC-SHA256 (`timingSafeEqual`), encola purga vía Outbox y conserva evidencia legal minimizada en `consent_receipts` (`minimized_at`, `subject_hash` sin PII).
4. **Cifrado de Secretos y Anti-SSRF:** Credenciales TOTP y API keys de proveedores LLM se cifran con AES-256-GCM versionado (`v1:<iv>:<tag>:<ct>`) con soporte de rotación (`ENCRYPTION_PREVIOUS_KEYS_B64`). Las URLs de proveedores validan esquema HTTPS (salvo loopback explícito en laboratorio local) y bloquean rangos IP privados, link-local y metadata (`169.254.169.254`).
