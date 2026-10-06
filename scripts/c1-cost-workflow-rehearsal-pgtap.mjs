import {isDeepStrictEqual} from 'node:util'
export const workflowPgTapOwnerPolicy=Object.freeze({
 oid:'10',name:'supabase_admin',
 attributes:Object.freeze({rolsuper:true,rolinherit:true,rolcreaterole:true,rolcreatedb:true,rolcanlogin:true,rolreplication:true,rolbypassrls:true,rolconnlimit:-1,rolvaliduntil:null}),
})
export const workflowPgTapExpectedMetadata=Object.freeze({extension:'pgtap',version:'1.3.3',schema:'extensions',owner:workflowPgTapOwnerPolicy.name,ownerOid:workflowPgTapOwnerPolicy.oid,ownerAttributes:workflowPgTapOwnerPolicy.attributes,planMember:true})
const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
export function workflowPgTapRoleAttributesSql(alias){
 if(!/^[a-z][a-z_0-9]*$/.test(alias))throw new Error('WORKFLOW_REHEARSAL_PGTAP_OWNER_ALIAS')
 return 'jsonb_build_object('+Object.keys(workflowPgTapOwnerPolicy.attributes).map(key=>literal(key)+','+alias+'.'+key).join(',')+')'
}
export function workflowPgTapOwnerPredicateSql(alias){
 return alias+".oid='10'::oid and "+alias+".rolname='supabase_admin' and "+workflowPgTapRoleAttributesSql(alias)+'='+literal(JSON.stringify(workflowPgTapOwnerPolicy.attributes))+'::jsonb'
}
export function assertWorkflowPgTapInstalledMetadata(metadata){
 const actual=metadata?.actual
 if(metadata?.schemaVersion!==2||metadata.phase!=='installed'||!isDeepStrictEqual(metadata.expected,workflowPgTapExpectedMetadata)||!actual||actual.version!=='1.3.3'||actual.schema!=='extensions'||actual.owner!==workflowPgTapOwnerPolicy.name||String(actual.ownerOid)!==workflowPgTapOwnerPolicy.oid||!isDeepStrictEqual(actual.ownerAttributes,workflowPgTapOwnerPolicy.attributes)||metadata.planMember!==true)throw new Error('WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION')
 return metadata
}
// Server-bundled pgTAP only. This SQL is source until the exact manifest is authorized.
export const workflowPgTapSetup=Object.freeze({
 mode:'transactional-create-per-suite',name:'pgtap',version:'1.3.3',schema:'extensions',baseline:'absent',
 cascade:false,retain:false,installations:4,rollback:'same-session-with-migrations-and-one-fixture',
 role:'postgres',superuser:false,owner:workflowPgTapOwnerPolicy,
 controls:Object.freeze({superuser:false,trusted:false,relocatable:true,schema:null,requires:Object.freeze(['plpgsql'])}),
 schemaAcl:'{postgres=UC/postgres,anon=U/postgres,authenticated=U/postgres,service_role=U/postgres,dashboard_user=UC/postgres}',
 prerequisite:Object.freeze({name:'plpgsql',version:'1.0',schema:'pg_catalog'}),
})
export const workflowPgTapMetadataSql=String.raw`(select jsonb_build_object(
 'schemaVersion',2,'phase','installed',
 'expected',${literal(JSON.stringify(workflowPgTapExpectedMetadata))}::jsonb,
 'actual',(select jsonb_build_object(
  'version',case when e.extversion ~ '^[0-9]{1,3}([.][0-9]{1,3}){1,3}$' then e.extversion else 'sha256:'||encode(sha256(convert_to(e.extversion,'UTF8')),'hex') end,
  'schemaOid',n.oid,'schema',case when n.nspname in ('extensions','public','pg_catalog') then n.nspname::text else 'sha256:'||encode(sha256(convert_to(n.nspname::text,'UTF8')),'hex') end,
  'ownerOid',e.extowner,'owner',case when pg_get_userbyid(e.extowner) in ('postgres','cli_login_postgres','supabase_admin','supabase_privileged_role') then pg_get_userbyid(e.extowner)::text else 'sha256:'||encode(sha256(convert_to(pg_get_userbyid(e.extowner)::text,'UTF8')),'hex') end,
  'ownerAttributes',(select ${workflowPgTapRoleAttributesSql('metadata_owner')} from pg_catalog.pg_roles metadata_owner where metadata_owner.oid=e.extowner)
 ) from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap'),
 'caller',jsonb_build_object(
  'currentUser',case when current_user in ('postgres','cli_login_postgres','supabase_admin','supabase_privileged_role') then current_user::text else 'sha256:'||encode(sha256(convert_to(current_user::text,'UTF8')),'hex') end,
  'sessionUser',case when session_user in ('postgres','cli_login_postgres','supabase_admin','supabase_privileged_role') then session_user::text else 'sha256:'||encode(sha256(convert_to(session_user::text,'UTF8')),'hex') end,
  'currentUserSuperuser',exists(select 1 from pg_catalog.pg_roles where rolname=current_user and rolsuper)),
 'defaultVersion',(select case when default_version ~ '^[0-9]{1,3}([.][0-9]{1,3}){1,3}$' then default_version else 'sha256:'||encode(sha256(convert_to(default_version,'UTF8')),'hex') end from pg_catalog.pg_available_extensions where name='pgtap'),
 'planMember',exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace join pg_catalog.pg_depend d on d.classid='pg_catalog.pg_proc'::regclass and d.objid=p.oid and d.deptype='e' join pg_catalog.pg_extension e on e.oid=d.refobjid where n.nspname='extensions' and p.proname='plan' and p.pronargs=1 and p.proargtypes[0]='pg_catalog.int4'::regtype and e.extname='pgtap')
))`
export function workflowPgTapGuardSql(phase='installed'){
 if(!['available','installed'].includes(phase))throw new Error('WORKFLOW_REHEARSAL_PGTAP_PHASE')
 if(phase==='installed')return "raise warning 'WORKFLOW_REHEARSAL_PGTAP_METADATA: %', "+workflowPgTapMetadataSql+";\n"+String.raw`
 if not exists(select 1 from pg_catalog.pg_extension where extname='pgtap') then raise exception 'WORKFLOW_REHEARSAL_PGTAP_NOT_INSTALLED';end if;
 if not exists(select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgtap' and e.extversion='1.3.3' and n.nspname='extensions' and e.extowner='10'::oid and exists(select 1 from pg_catalog.pg_roles owner_role where owner_role.oid=e.extowner and ${workflowPgTapOwnerPredicateSql('owner_role')})) then raise exception 'WORKFLOW_REHEARSAL_PGTAP_INSTALLED_VERSION';end if;
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
