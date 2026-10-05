// Server-bundled pgTAP only. This SQL is source until the exact manifest is authorized.
export const workflowPgTapSetup=Object.freeze({
 mode:'transactional-create-per-suite',name:'pgtap',version:'1.3.3',schema:'extensions',baseline:'absent',
 cascade:false,retain:false,installations:4,rollback:'same-session-with-migrations-and-one-fixture',
 role:'postgres',superuser:false,
 controls:Object.freeze({superuser:false,trusted:false,relocatable:true,schema:null,requires:Object.freeze(['plpgsql'])}),
 schemaAcl:'{postgres=UC/postgres,anon=U/postgres,authenticated=U/postgres,service_role=U/postgres,dashboard_user=UC/postgres}',
 prerequisite:Object.freeze({name:'plpgsql',version:'1.0',schema:'pg_catalog'}),
})
export function workflowPgTapGuardSql(phase='installed'){
 if(!['available','installed'].includes(phase))throw new Error('WORKFLOW_REHEARSAL_PGTAP_PHASE')
 if(phase==='installed')return String.raw`
 if not exists(select 1 from pg_catalog.pg_extension where extname='pgtap') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_NOT_INSTALLED';end if;
 if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap' and e.extversion='1.3.3' and n.nspname='extensions' and pg_catalog.pg_get_userbyid(e.extowner)='postgres') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION';end if;
 if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace join pg_catalog.pg_depend d on d.classid='pg_catalog.pg_proc'::regclass and d.objid=p.oid and d.deptype='e' join pg_catalog.pg_extension e on e.oid=d.refobjid where n.nspname='extensions' and p.proname='plan' and p.pronargs=1 and p.proargtypes[0]='pg_catalog.int4'::regtype and e.extname='pgtap') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION';end if;
 `
 return String.raw`
 if exists(select 1 from pg_catalog.pg_extension where extname='pgtap') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_EXPECT_ABSENT';end if;
 if session_user<>'postgres' or current_user<>'postgres'
 or exists(select 1 from pg_catalog.pg_roles where rolname=current_user and rolsuper)
 or not pg_catalog.has_database_privilege(pg_catalog.current_database(),'CREATE')
 or not pg_catalog.has_database_privilege(pg_catalog.current_database(),'TEMP')
 or not pg_catalog.has_schema_privilege('extensions','CREATE')
 or not pg_catalog.has_schema_privilege('extensions','USAGE')
 or not pg_catalog.has_language_privilege('sql','USAGE')
 or not pg_catalog.has_language_privilege('plpgsql','USAGE')
 then raise exception 'WORKFLOW_REHEARSAL_PGTAP_PREREQUISITES';end if;
 if not exists(select 1 from pg_catalog.pg_namespace where nspname='extensions' and pg_catalog.pg_get_userbyid(nspowner)='postgres' and nspacl::text='{postgres=UC/postgres,anon=U/postgres,authenticated=U/postgres,service_role=U/postgres,dashboard_user=UC/postgres}') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_SCHEMA_CHANGED';end if;
 if not exists(select 1 from pg_catalog.pg_available_extension_versions where name='pgtap' and version='1.3.3' and not installed and not superuser and not trusted and relocatable and schema is null and requires::text[] = array['plpgsql']::text[]) then raise exception 'WORKFLOW_REHEARSAL_PGTAP_UNAVAILABLE';end if;
 if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='plpgsql' and e.extversion='1.0' and n.nspname='pg_catalog') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_PREREQUISITES';end if;
 `
}
export const workflowPgTapSetupSql="create extension pgtap with schema extensions version '1.3.3';\ndo $workflow_pgtap_installed$\nbegin\n"+workflowPgTapGuardSql('installed')+"\nend;$workflow_pgtap_installed$;\n"
