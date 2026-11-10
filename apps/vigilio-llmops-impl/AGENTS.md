# Reglas del backend
- NestJS/TypeScript, controladores finos, Zod DTOs, Pg/Drizzle, ports por aggregate real.
- Ninguna consulta de tenant por ID sin filtro/validación de pertenencia.
- Nunca cookies o tokens en logs; secretos por entorno, no en repositorio.
- Añadir pruebas unitarias, integración, contrato y E2E según riesgo.
- Comandos: pnpm install --frozen-lockfile; pnpm lint; pnpm typecheck; pnpm test:coverage.
- No afirmar verificado si faltan dependencias, base de datos, Meta o docker.
