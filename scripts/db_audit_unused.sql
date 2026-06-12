-- ════════════════════════════════════════════════════════════════════════════
-- AUDITORÍA DE USO DE LA BASE  (SOLO LECTURA — no borra nada)
-- Pegar en Supabase → SQL Editor y correr query por query.
-- Sirve para decidir mañana QUÉ se puede limpiar (tablas/índices/columnas
-- sin uso) y para ver cuánto storage estás gastando del free (1 GB).
--
-- ⚠️ Las estadísticas (seq_scan/idx_scan) se acumulan desde el último reset.
--    "0 usos" puede significar "nadie la usa" O "stats reseteadas hace poco".
--    Confírmalo contra el código antes de borrar nada.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Tamaño de cada tabla (datos + índices), las más pesadas primero
select schemaname,
       relname                                   as tabla,
       pg_size_pretty(pg_total_relation_size(relid)) as tamano_total,
       n_live_tup                                as filas_aprox
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc;

-- 2) Tablas VACÍAS (candidatas a revisar/eliminar)
select schemaname, relname as tabla, n_live_tup as filas
from pg_stat_user_tables
where n_live_tup = 0
order by relname;

-- 3) Tablas que NADIE consulta (ni scan secuencial ni por índice)
select schemaname, relname as tabla, seq_scan, idx_scan, n_live_tup
from pg_stat_user_tables
where coalesce(seq_scan,0) = 0 and coalesce(idx_scan,0) = 0
order by relname;

-- 4) Índices NUNCA usados (ocupan espacio y ralentizan escrituras)
select schemaname, relname as tabla, indexrelname as indice,
       pg_size_pretty(pg_relation_size(indexrelid)) as tamano,
       idx_scan as usos
from pg_stat_user_indexes
where idx_scan = 0
order by pg_relation_size(indexrelid) desc;

-- 5) STORAGE por bucket (fotos/avatares/VIDEOS = lo que llena el free de 1 GB)
select b.name                                                        as bucket,
       count(o.id)                                                   as objetos,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint),0)) as tamano
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.name
order by coalesce(sum((o.metadata->>'size')::bigint),0) desc;

-- 6) Objetos de Storage HUÉRFANOS por antigüedad (revisar manualmente)
--    Ejemplo: archivos de progress-photos subidos hace >12 meses, etc.
-- select bucket_id, name, (metadata->>'size')::bigint as bytes, created_at
-- from storage.objects
-- order by created_at asc
-- limit 50;

-- 7) Columnas potencialmente sin uso (100% NULL) — revisar tabla por tabla.
--    Cambia el nombre de tabla/columna que sospeches:
-- select count(*) as total, count(columna_sospechosa) as con_dato
-- from public.nombre_tabla;

-- 8) Funciones y políticas RLS por tabla (para el audit de seguridad de mañana)
-- select schemaname, tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
-- order by tablename, policyname;
