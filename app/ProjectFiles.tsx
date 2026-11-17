"use client";
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type FileRow={id:string;project_id:string;user_id:string;unit_number:number|null;category:string;file_name:string;storage_path:string;mime_type:string;size_bytes:number;created_at:string};
const BUCKET='project-files';
const MAX_BYTES=20*1024*1024;
const allowed=['image/jpeg','image/png','image/heic','image/heif','application/pdf'];
export default function ProjectFiles({projectId,userId,unit}:{projectId:string;userId:string;unit:number|null}){
 const [files,setFiles]=useState<FileRow[]>([]),[category,setCategory]=useState('Construction Photos'),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[opening,setOpening]=useState<string|null>(null);
 const load=useCallback(async()=>{const query=supabase.from('project_files').select('*').eq('project_id',projectId).order('created_at',{ascending:false});const {data,error}=unit===null?await query.is('unit_number',null):await query.eq('unit_number',unit);if(error)setError('DATABASE READ: '+error.message);else setFiles((data||[]) as FileRow[])},[projectId,unit]);
 useEffect(()=>{setError('');setNotice('');void load()},[load]);
 async function upload(selected:FileList|null){if(!selected?.length)return;setError('');setNotice('');setUploading(true);let count=0;try{for(const file of Array.from(selected)){
  const ext=(file.name.split('.').pop()||'').toLowerCase();const mime=file.type||({'jpg':'image/jpeg','jpeg':'image/jpeg','png':'image/png','heic':'image/heic','heif':'image/heif','pdf':'application/pdf'} as Record<string,string>)[ext]||'';
  if(!allowed.includes(mime)||!['jpg','jpeg','png','heic','heif','pdf'].includes(ext))throw Error('Only JPG, PNG, HEIC and PDF files are supported.');
  if(file.size>MAX_BYTES)throw Error(`${file.name} exceeds the 20 MB limit.`);
  const id=crypto.randomUUID();const path=`${userId}/${projectId}/${id}.${ext}`;
  const {error:storageError}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:mime,upsert:false});if(storageError)throw Error('STORAGE UPLOAD: '+storageError.message);
  const {error:dbError}=await supabase.from('project_files').insert({id,project_id:projectId,user_id:userId,unit_number:unit,category,file_name:file.name,storage_path:path,mime_type:mime,size_bytes:file.size});
  if(dbError){await supabase.storage.from(BUCKET).remove([path]);throw Error('DATABASE INSERT: '+dbError.message);}count++;
 }setNotice(`${count} file${count===1?'':'s'} uploaded successfully.`);await load();}catch(e){setError(e instanceof Error?e.message:'Upload failed.');if(count)await load();}finally{setUploading(false)}}
 async function openFile(row:FileRow){setOpening(row.id);setError('');try{const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path,60);if(error)throw Error('STORAGE VIEW: '+error.message);if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener,noreferrer');}catch(e){setError(e instanceof Error?e.message:'Could not open file.')}finally{setOpening(null)}}
 async function removeFile(row:FileRow){if(!window.confirm(`Delete ${row.file_name}? This cannot be undone.`))return;setError('');const {error:storageError}=await supabase.storage.from(BUCKET).remove([row.storage_path]);if(storageError){setError('STORAGE DELETE: '+storageError.message);return;}const {error:dbError}=await supabase.from('project_files').delete().eq('id',row.id);if(dbError)setError('DATABASE DELETE: '+dbError.message);else{setNotice('File deleted.');await load();}}
 return <section className="panel" style={{marginTop:20}}><h2>Photos &amp; Blueprints</h2><p className="muted">{unit===null?'Project Files':`Unit ${unit} Files`} · Private storage</p>
 <div className="formgrid"><div><label htmlFor="file-category">File category</label><select id="file-category" value={category} onChange={e=>setCategory(e.target.value)}><option>Construction Photos</option><option>Architectural Plans</option><option>Design References</option></select></div><div><label htmlFor="project-upload">Upload photos or PDF (max 20 MB each)</label><input id="project-upload" type="file" multiple accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf" disabled={uploading} onChange={e=>{void upload(e.target.files);e.target.value='';}}/></div></div>
 {uploading&&<p className="muted" role="status">Uploading… Please keep this page open.</p>}{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success" role="status">{notice}</p>}
 <div className="file-list">{files.length===0?<p className="muted">No files uploaded yet.</p>:files.map(row=><div className="file-item" key={row.id}><div className="file-info"><strong>{row.mime_type==='application/pdf'?'📄':'📷'} {row.file_name}</strong><small className="muted">{row.category} · {(row.size_bytes/1024/1024).toFixed(1)} MB · {new Date(row.created_at).toLocaleDateString('en-US')}</small></div><div className="file-actions"><button className="secondary" disabled={opening===row.id} onClick={()=>void openFile(row)}>{opening===row.id?'Opening…':'View'}</button><button className="secondary" onClick={()=>void removeFile(row)}>Delete</button></div></div>)}</div>
 <p className="muted" style={{fontSize:12}}>Files are private and linked to your account. Some browsers may download HEIC photos instead of previewing them.</p></section>
}
