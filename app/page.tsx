"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import ProjectFiles from "./ProjectFiles";
import DesignStudio from "./DesignStudio";
import Operations from "./Operations";

type Project = { id:string; name:string; address:string|null; status:string; budget:number; start_date:string|null; end_date:string|null; created_at:string };
type ProjectForm = { name:string; address:string; status:string; budget:string; start_date:string; end_date:string };
type Section = "dashboard"|"projects"|"finances"|"tasks"|"design"|"files";
const blank:ProjectForm = {name:"",address:"",status:"planning",budget:"",start_date:"",end_date:""};
const money = (n:number) => Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
const date = (s:string|null) => s ? new Date(s+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "Not scheduled";
const title = (s:string) => s.replace(/_/g," ").replace(/^./,x=>x.toUpperCase());

export default function Home(){
  const [user,setUser] = useState<User|null>(null);
  const [ready,setReady] = useState(false);
  const [projects,setProjects] = useState<Project[]>([]);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [selectedProject,setSelectedProject] = useState<string|null>(null);
  const [selectedUnit,setSelectedUnit] = useState(1);
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [note,setNote] = useState("");
  const [showForm,setShowForm] = useState(false);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [form,setForm] = useState<ProjectForm>(blank);
  const [filter,setFilter] = useState("all");
  const [portfolioSpent,setPortfolioSpent] = useState(0);
  const [portfolioTasks,setPortfolioTasks] = useState({total:0,done:0});
  const [section,setSection] = useState<Section>("dashboard");
  const [hour,setHour] = useState<number|null>(null);
  const [coverUrls,setCoverUrls] = useState<Record<string,string>>({});
  const [coverBusy,setCoverBusy] = useState<string|null>(null);
  const [coverError,setCoverError] = useState("");
  const [coverRefresh,setCoverRefresh] = useState(0);


  useEffect(()=>{
    const refresh = ()=>setHour(new Date().getHours());
    refresh();
    const interval = window.setInterval(refresh,60_000);
    document.addEventListener("visibilitychange",refresh);
    return ()=>{window.clearInterval(interval);document.removeEventListener("visibilitychange",refresh)};
  },[]);
  const greeting = hour===null ? "Welcome back" : hour<12 ? "Good morning" : hour<18 ? "Good afternoon" : "Good evening";
  const greetingIcon = hour===null ? "✨" : hour<12 ? "☀️" : hour<18 ? "🌤️" : "🌙";

  useEffect(()=>{
    supabase.auth.getUser().then(({data,error})=>{if(error)setError(error.message);setUser(data.user);setReady(true)});
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(user)void load();else{setProjects([]);setSelectedProject(null)}},[user]);
  useEffect(()=>{if(!user)return;try{const value=localStorage.getItem("buildpilot-notes-"+user.id);setNotes(value?JSON.parse(value):{})}catch{setNotes({})}},[user]);

  async function load(){
    const {data,error} = await supabase.from("projects").select("*").order("created_at",{ascending:false});
    if(error)setError(error.message);else{setProjects(data||[]);setError("")}
  }
  useEffect(()=>{
    if(!user)return;
    let cancelled=false;
    async function loadPortfolio(){
      const [e,t] = await Promise.all([
        supabase.from("project_expenses").select("project_id,amount").eq("user_id",user!.id),
        supabase.from("project_tasks").select("project_id,status").eq("user_id",user!.id)
      ]);
      if(cancelled)return;
      const liveIds=new Set(projects.filter(p=>p.status!=="archived").map(p=>p.id));
      if(!e.error)setPortfolioSpent((e.data||[]).filter(x=>liveIds.has(x.project_id)).reduce((a,x)=>a+Number(x.amount||0),0));
      if(!t.error){const rows=(t.data||[]).filter(x=>liveIds.has(x.project_id));setPortfolioTasks({total:rows.length,done:rows.filter(x=>x.status==="done").length})}
    }
    void loadPortfolio();
    return ()=>{cancelled=true};
  },[user,projects,selectedProject,section]);

  // Cover images are private Supabase Storage objects; signed URLs expire after one hour.
  useEffect(()=>{
    if(!user){setCoverUrls({});return}
    let cancelled=false;
    async function loadCovers(){
      const {data,error}=await supabase.from("project_files")
        .select("project_id,storage_path,created_at")
        .eq("user_id",user!.id).eq("category","Project Cover")
        .order("created_at",{ascending:false});
      if(error){if(!cancelled)setCoverError("Could not load cover photos: "+error.message);return}
      const newest=new Map<string,string>();
      for(const row of data||[])if(!newest.has(row.project_id))newest.set(row.project_id,row.storage_path);
      const urls:Record<string,string>={};
      await Promise.all([...newest].map(async ([projectId,path])=>{
        const {data}=await supabase.storage.from("project-files").createSignedUrl(path,3600);
        if(data?.signedUrl)urls[projectId]=data.signedUrl;
      }));
      if(!cancelled){setCoverUrls(urls);setCoverError("")}
    }
    void loadCovers();
    const timer=window.setInterval(()=>void loadCovers(),45*60*1000);
    return ()=>{cancelled=true;window.clearInterval(timer)};
  },[user,coverRefresh]);

  async function uploadCover(project:Project,file:File|undefined){
    if(!file||!user)return;
    const allowed=["image/jpeg","image/png","image/webp"];
    if(!allowed.includes(file.type)){setCoverError("Choose a JPG, PNG or WebP image.");return}
    if(file.size>10*1024*1024){setCoverError("Cover images must be smaller than 10 MB.");return}
    setCoverBusy(project.id);setCoverError("");
    try{
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const id=crypto.randomUUID();
      const path=`${user.id}/${project.id}/${id}.${ext}`;
      const {error:uploadError}=await supabase.storage.from("project-files")
        .upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw Error(uploadError.message);
      const {error:dbError}=await supabase.from("project_files").insert({
        id,project_id:project.id,user_id:user.id,unit_number:null,
        category:"Project Cover",file_name:file.name,storage_path:path,
        mime_type:file.type,size_bytes:file.size
      });
      if(dbError){await supabase.storage.from("project-files").remove([path]);throw Error(dbError.message)}
      setCoverRefresh(v=>v+1);
      setMessage("Cover photo updated for "+project.name+".");
    }catch(e){setCoverError(e instanceof Error?e.message:"Could not upload cover photo.")}
    finally{setCoverBusy(null)}
  }

  function coverPicker(project:Project,compact=false){return <label className={"bp-cover-picker"+(compact?" bp-cover-picker-compact":"")} title="Change cover photo" aria-label="Change cover photo" onClick={e=>e.stopPropagation()}>
    {coverBusy===project.id?"…":compact?"📷":"📷 Change Cover"}
    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={coverBusy!==null}
      onChange={e=>{const file=e.currentTarget.files?.[0];void uploadCover(project,file);e.currentTarget.value=""}} />
  </label>}

  async function login(reset=false){
    setBusy(true);setError("");setMessage("");
    try{
      if(reset){
        if(!email)throw Error("Enter your email first.");
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+"/reset"});
        if(error)throw error;
        setMessage("Password reset email requested.");
      }else{
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error)throw error;
      }
    }catch(e){setError(e instanceof Error?e.message:"Authentication failed")}
    finally{setBusy(false)}
  }
  function startCreate(){setSection("projects");setSelectedProject(null);setEditingId(null);setForm(blank);setShowForm(true);setError("")}
  function startEdit(p:Project){setSection("projects");setSelectedProject(null);setEditingId(p.id);setForm({name:p.name,address:p.address||"",status:p.status,budget:String(p.budget||0),start_date:p.start_date||"",end_date:p.end_date||""});setShowForm(true);setError("")}
  async function saveProject(e:FormEvent){
    e.preventDefault();if(!user)return;
    setBusy(true);setError("");
    const payload={name:form.name.trim(),address:form.address.trim()||null,status:form.status,budget:Number(form.budget||0),start_date:form.start_date||null,end_date:form.end_date||null};
    const result=editingId ? await supabase.from("projects").update(payload).eq("id",editingId).eq("user_id",user.id) : await supabase.from("projects").insert({...payload,user_id:user.id});
    setBusy(false);
    if(result.error){setError(result.error.message);return}
    setShowForm(false);setEditingId(null);setForm(blank);
    setMessage(editingId?"Project updated successfully.":"Project created successfully.");
    await load();
  }
  async function archive(p:Project){
    if(!user||!window.confirm(p.status==="archived"?"Restore this project?":"Archive this project?"))return;
    setError("");
    const {error}=await supabase.from("projects").update({status:p.status==="archived"?"planning":"archived"}).eq("id",p.id).eq("user_id",user.id);
    if(error)setError(error.message);else await load();
  }
  async function deleteProject(p:Project){
    if(!user)return;
    const confirmation=window.prompt(`PERMANENT DELETE: Type the project name exactly to delete "${p.name}" and its linked records. This cannot be undone.`);
    if(confirmation!==p.name)return;
    setBusy(true);setError("");
    const {error:deleteError}=await supabase.from("projects").delete().eq("id",p.id).eq("user_id",user.id);
    setBusy(false);
    if(deleteError){setError(deleteError.message);return}
    if(selectedProject===p.id)setSelectedProject(null);
    setMessage(`Deleted ${p.name}. Check file storage separately for any uploaded files.`);
    await load();
  }
  function navigate(next:Section){
    setSection(next);setShowForm(false);setEditingId(null);
    if(next==="dashboard"||next==="projects")setSelectedProject(null);
    else if(!selectedProject&&projects.length)setSelectedProject(projects.find(p=>p.status!=="archived")?.id||null);
  }
  function openProject(p:Project){
    setSection("projects");setSelectedProject(p.id);setSelectedUnit(1);
    const putnam=/158\s+putnam/i.test(p.name+" "+(p.address||""));
    setNote(notes[p.id+":"+(putnam?1:0)]||"");
  }
  function switchUnit(id:string,n:number){setSelectedUnit(n);setNote(notes[id+":"+n]||"")}
  function saveNote(id:string,n:number){
    if(!user)return;
    const next={...notes,[id+":"+n]:note};
    try{localStorage.setItem("buildpilot-notes-"+user.id,JSON.stringify(next));setNotes(next);setMessage("Notes saved on this device.")}
    catch{setError("Could not save notes on this device.")}
  }

  const live=projects.filter(p=>p.status!=="archived");
  const active=live.filter(p=>p.status==="active").length;
  const planning=live.filter(p=>p.status==="planning").length;
  const completed=live.filter(p=>p.status==="completed").length;
  const shown=projects.filter(p=>filter==="all"?p.status!=="archived":filter==="archived"?p.status==="archived":p.status===filter);
  const current=projects.find(p=>p.id===selectedProject);
  const featured=live.find(p=>/158\s+putnam/i.test(p.name+" "+(p.address||"")))||live[0];
  const budget=live.reduce((sum,p)=>sum+Number(p.budget||0),0);
  const putnam=current ? /158\s+putnam/i.test(current.name+" "+(current.address||"")) : false;

  if(!ready)return <div className="auth">Loading BuildPilot…</div>;
  if(!user)return <div className="auth"><div className="brand" style={{color:"#092744"}}>Build<span>Pilot</span></div><h2>Welcome back</h2><p className="muted">Secure construction project management</p><div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></div><div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void login()}}/></div>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}<button disabled={busy} onClick={()=>login()}>Sign in</button><p><button className="secondary" disabled={busy} onClick={()=>login(true)}>Forgot password?</button></p></div>;

  return <div className="shell bp-shell"><style>{`
    .bp-shell{min-height:100vh;background:#f5f7fb;color:#1b2d44;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .bp-shell .sidebar{background:linear-gradient(180deg,#f9fbff,#edf2fa);border-right:1px solid #e2e8f2;min-width:240px;box-shadow:2px 0 24px #20364a08}
    .bp-shell .main{width:100%;min-width:0;max-width:none;padding:36px clamp(18px,3vw,48px)}
    .bp-shell .brand{font-weight:850;letter-spacing:-1.1px;font-size:27px;color:#172b44}.bp-shell .brand span{color:#2378f4}
    .bp-caption{color:#8390a3;font-size:12px;text-transform:uppercase;letter-spacing:1.6px;margin:26px 12px 10px;font-weight:700}
    .bp-side-note{color:#718399;font-size:13px;line-height:1.6;margin:12px}
    .bp-nav{display:flex;flex-direction:column;gap:8px;margin-top:16px}
    .bp-nav button{display:block;width:100%;background:transparent!important;color:#53657c!important;text-align:left!important;border:0!important;border-radius:13px!important;padding:14px 15px!important;font-weight:600!important;font-size:14px!important}
    .bp-nav button.selected,.bp-nav button:hover{background:#fff!important;color:#1769d2!important;box-shadow:0 5px 18px #254b7812}
    .bp-top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:23px}
    .bp-eyebrow{color:#7b8ca3;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin:0 0 9px}
    .bp-title{color:#1c2d43;font-size:clamp(30px,3.5vw,46px);font-weight:800;letter-spacing:-1.7px;line-height:1.14;margin:0}
    .bp-subtitle{color:#8190a3;font-size:15px;margin:11px 0 0}
    .bp-signout{background:#fff!important;color:#173653!important;border:1px solid #dde6ed!important;border-radius:13px!important;padding:11px 16px!important}
    .bp-quick{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
    .bp-quick button{background:#fff!important;border:1px solid #dbe5ee!important;color:#173451!important;border-radius:13px!important;padding:11px 14px!important;font-weight:700!important;box-shadow:0 4px 16px #24415e0a}
    .bp-feature{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(250px,.7fr);gap:18px;margin-bottom:22px}
    .bp-feature-photo{min-height:290px;position:relative;overflow:hidden;border-radius:26px;background:linear-gradient(135deg,#203b5c,#4c7293 55%,#a9bfcf);padding:28px;display:flex;flex-direction:column;justify-content:space-between;color:#fff;box-shadow:0 12px 30px #17314d24}
    /* Original 158 Putnam Ave photograph; displayed without image filters or alterations. */
    .bp-feature-photo.bp-putnam-cover{background-image:linear-gradient(90deg,rgba(9,25,43,.67) 0%,rgba(9,25,43,.18) 58%,rgba(9,25,43,.02) 100%),url("/putnam-cover.jpg");background-size:cover;background-position:center center}
    .bp-feature-photo.bp-putnam-cover:before{display:none}
    .bp-feature-photo.bp-custom-cover{background-size:cover;background-position:center center}
    .bp-feature-photo.bp-custom-cover:before{display:none}
    .bp-cover-picker{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;background:#fff!important;color:#1769d2!important;border:1px solid #dce8fa;border-radius:11px;padding:9px 12px;font-size:12px;font-weight:750;box-shadow:0 4px 15px #172b4420}
    .bp-cover-picker input{display:none}.bp-cover-picker:has(input:disabled){opacity:.6;cursor:wait}
    .bp-cover-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:relative;z-index:2}

    /* BuildPilot 3.4 — Clean Project Cover */
    .bp-feature-photo{position:relative}
    .bp-feature-photo .bp-cover-description{font-size:14px!important;font-weight:550;letter-spacing:.1px;margin-top:8px!important}
    .bp-feature-photo .bp-cover-actions{margin-top:18px}
    .bp-feature-photo .bp-feature-open{font-size:13px!important;padding:10px 15px!important}
    .bp-cover-corner{position:absolute!important;top:19px;right:19px;z-index:5!important}
    .bp-cover-picker.bp-cover-picker-compact{width:38px;height:38px;min-width:38px;padding:0!important;border-radius:12px!important;background:rgba(255,255,255,.94)!important;color:#174c83!important;font-size:18px!important;box-shadow:0 4px 15px #0c1b3040}
    .bp-cover-picker.bp-cover-picker-compact:hover{background:#fff!important}
    @media(max-width:760px){.bp-cover-corner{top:14px;right:14px}.bp-cover-picker.bp-cover-picker-compact{width:35px;height:35px;min-width:35px}.bp-feature-photo .bp-feature-open{padding:10px 13px!important}}
    .bp-cover-error{background:#fff1f0;color:#a91b1b;border-radius:12px;padding:12px 15px;margin-bottom:14px;font-size:13px}

    .bp-feature-photo.bp-putnam-cover h2,.bp-feature-photo.bp-putnam-cover p{text-shadow:0 2px 10px rgba(0,0,0,.55)}
    .bp-feature-photo.bp-putnam-cover .bp-feature-pill{background:rgba(16,35,56,.45);backdrop-filter:blur(8px)}
    .bp-feature-photo:before{content:"";position:absolute;right:-30px;bottom:-45px;width:65%;height:78%;opacity:.3;background:repeating-linear-gradient(90deg,transparent 0 44px,#dbeaff 45px 47px,transparent 48px 93px),linear-gradient(0deg,#fff5,transparent);clip-path:polygon(10% 25%,35% 10%,55% 25%,75% 7%,98% 25%,98% 100%,10% 100%)}
    .bp-feature-photo>*{position:relative;z-index:1}.bp-feature-photo h2{font-size:clamp(25px,3vw,39px);letter-spacing:-1px;color:#fff;margin:7px 0}.bp-feature-photo p{color:#e5f0ff;margin:0}
    .bp-feature-pill{display:inline-flex;align-self:flex-start;border-radius:99px;background:#ffffff30;border:1px solid #ffffff50;padding:8px 13px;font-size:12px;font-weight:700}
    .bp-feature-open{align-self:flex-start;background:#fff!important;color:#216bd0!important;border-radius:12px!important;padding:11px 17px!important;font-weight:700!important}
    .bp-feature-summary,.bp-panel,.bp-stat{background:#fff;border:1px solid #e7edf5;border-radius:23px;box-shadow:0 8px 32px #243e6110}
    .bp-feature-summary{border-radius:26px;padding:25px;display:flex;flex-direction:column;justify-content:center;gap:13px}.bp-feature-summary h3{font-size:21px;margin:0;color:#21344b}
    .bp-feature-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #edf1f6;padding:12px 0;color:#77889b}.bp-feature-row strong{color:#21344b;overflow-wrap:anywhere;text-align:right}.bp-feature-row:last-child{border-bottom:0}
    .bp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:24px}
    .bp-stat{padding:23px;min-width:0}.bp-stat-label{color:#77889f;font-size:13px;font-weight:600}.bp-stat-value{font-weight:850;font-size:clamp(24px,2.7vw,33px);letter-spacing:-.7px;margin:13px 0 9px;overflow-wrap:anywhere;line-height:1.1;color:#1b2d44}.bp-stat-foot{font-size:12px;color:#8594a4}.bp-stat-icon{display:inline-flex;align-items:center;justify-content:center;border-radius:13px;background:#e9f1ff;color:#2577ee;font-size:18px;width:36px;height:36px;float:right}
    .bp-panel{padding:23px;margin-bottom:20px}.bp-panel-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:19px}.bp-panel-title{margin:0;color:#21344b;font-size:19px;letter-spacing:-.4px}
    .bp-action{border-radius:13px!important;background:#2679ef!important;color:#fff!important;font-weight:750!important;padding:11px 15px!important}
    .bp-projects{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.bp-project{border:1px solid #e4ebf4;border-radius:20px;background:#fff;padding:23px;min-width:0;box-shadow:0 5px 20px #213a5710}
    .bp-projecthead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.bp-projectname{border:0!important;background:transparent!important;padding:0!important;font-size:18px!important;color:#1e3551!important;font-weight:800!important;text-align:left!important;line-height:1.35!important;overflow-wrap:anywhere}
    .bp-badge{display:inline-block;padding:5px 10px;background:#edf3f9;border-radius:50px;color:#557087;font-size:11px;font-weight:750;white-space:nowrap}.bp-badge.active{background:#e5f7ed;color:#167b50}.bp-badge.planning{background:#fff1e5;color:#b65b12}
    .bp-address{font-size:13px;color:#72859a;margin:10px 0 17px;overflow-wrap:anywhere}.bp-projectbudget{font-size:22px;font-weight:850;color:#153451;margin:0}.bp-small{font-size:11px;color:#8495a6;margin:3px 0 15px}.bp-dates{border-top:1px solid #e8edf3;padding-top:12px;font-size:12px;color:#60788c}
    .bp-projectfoot{display:flex;justify-content:space-between;align-items:center;gap:9px;margin-top:15px;flex-wrap:wrap}.bp-open{background:#eaf2ff!important;color:#2679ef!important;border:1px solid #d9e8ff!important;padding:8px 12px!important;border-radius:11px!important;font-weight:750!important}.bp-archive{font-size:12px!important;background:transparent!important;color:#7c91a4!important;border:0!important;padding:8px!important}.bp-danger{background:#fff1f0!important;color:#b42318!important;border:1px solid #ffd0cb!important;border-radius:8px!important;padding:8px!important;font-weight:700!important}
    .bp-bottom{display:grid;grid-template-columns:1fr 1fr;gap:18px}.bp-listrow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #edf1f5;color:#435e77;font-size:13px}.bp-empty{color:#8596a6;font-size:13px;line-height:1.6}.bp-form{background:#f8fafc;border:1px solid #e1e9f1;border-radius:14px;padding:17px;margin-bottom:18px}.bp-form label{display:block;margin-bottom:5px}.bp-form input,.bp-form select{max-width:100%}.bp-filter{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bp-filter select{width:auto;min-width:130px}.bp-msg{margin:12px 0;padding:10px;border-radius:8px;background:#e5f7ed;color:#167b50}
    @media(max-width:1050px){.bp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:950px){.bp-feature{grid-template-columns:1fr}}@media(max-width:760px){.bp-shell .sidebar{min-width:0;background:#f2f6fc;border-right:0}.bp-shell .main{padding:20px 14px}.bp-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.bp-stat{padding:15px}.bp-projects,.bp-bottom{grid-template-columns:1fr}.bp-feature-photo{min-height:240px}.bp-panel{padding:17px}}@media(max-width:400px){.bp-stat-value{font-size:22px}.bp-stat-icon{width:30px;height:30px}}
  `}</style>
  <aside className="sidebar"><div className="brand">Build<span>Pilot</span></div><p className="bp-caption">Workspace</p><nav className="bp-nav" aria-label="Main navigation">{([
    ["dashboard","▦ Dashboard"],["projects","▤ Projects & Units"],["finances","$ Financial Management"],["tasks","☑ Tasks & Schedule"],["design","◈ Design Studio"],["files","▧ Photos & Blueprints"]
  ] as const).map(([key,label])=><button key={key} type="button" className={section===key?"selected":""} onClick={()=>navigate(key)}>{label}</button>)}</nav><p className="bp-caption">Construction management</p><p className="bp-side-note">Plan, track and deliver every project.</p></aside>
  <main className="main">
  {current&&section!=="dashboard" ? <>
    <div className="bp-top"><div><button className="secondary" onClick={()=>{setSelectedProject(null);setMessage("")}}>← Back to Projects</button><h1>{current.name}</h1><p className="muted">{current.address||"No address added"} · {title(current.status)}</p></div><button className="secondary" onClick={()=>supabase.auth.signOut()}>Sign out</button></div>
    <div className="bp-stats"><div className="bp-stat"><div className="bp-stat-label">Project Budget</div><div className="bp-stat-value">{money(current.budget)}</div></div><div className="bp-stat"><div className="bp-stat-label">Start Date</div><div className="bp-stat-value" style={{fontSize:19}}>{date(current.start_date)}</div></div><div className="bp-stat"><div className="bp-stat-label">Target End Date</div><div className="bp-stat-value" style={{fontSize:19}}>{date(current.end_date)}</div></div><div className="bp-stat"><div className="bp-stat-label">Project Status</div><div className="bp-stat-value" style={{fontSize:19}}>{title(current.status)}</div><button className="bp-open" onClick={()=>startEdit(current)}>Edit Project</button></div></div>
    {error&&<p className="error">{error}</p>}{message&&<p className="bp-msg">{message}</p>}
    <Operations projectId={current.id} userId={user.id} projectBudget={Number(current.budget||0)} mode={section==="tasks"?"tasks":section==="finances"?"finances":"all"}/>
    {section!=="finances"&&section!=="tasks"&&<>
      <section className="bp-panel"><h2>Project Notes</h2>{putnam&&<><p className="muted">Select a unit to view and edit its notes.</p><div className="unit-tabs">{[1,2,3].map(n=><button key={n} className={selectedUnit===n?"":"secondary"} onClick={()=>switchUnit(current.id,n)}>Unit {n}</button>)}</div></>}<h3>Notes — {putnam?"Unit "+selectedUnit:"Project"}</h3><textarea rows={5} value={note} onChange={e=>setNote(e.target.value)} placeholder="Add construction and design notes here..."/><p><button onClick={()=>saveNote(current.id,putnam?selectedUnit:0)}>Save Notes</button></p><p className="muted" style={{fontSize:12}}>Notes are saved on this device only. Cloud sync is a separate upcoming update.</p></section>
      {putnam&&<><DesignStudio projectId={current.id} userId={user.id} unit={selectedUnit}/><h2 style={{marginTop:24}}>Shared Project Files</h2><p className="muted">Files shared by all three units, including common kitchen and flooring references.</p><ProjectFiles projectId={current.id} userId={user.id} unit={null}/><h2 style={{marginTop:24}}>Unit {selectedUnit} Files</h2></>}
      <ProjectFiles projectId={current.id} userId={user.id} unit={putnam?selectedUnit:null}/>
    </>}
  </> : <>
    <div className="bp-top"><div><p className="bp-eyebrow">BuildPilot / Your workspace</p><h1 className="bp-title">{greeting}, Cesar! {greetingIcon}</h1><p className="bp-subtitle">Your construction workspace is ready. Let’s make progress today.</p></div><button className="bp-signout" onClick={()=>supabase.auth.signOut()}>Sign out</button></div>
    <div className="bp-quick"><button onClick={()=>navigate("projects")}>Manage Projects →</button><button onClick={()=>navigate("finances")}>Track Expenses →</button><button onClick={()=>navigate("tasks")}>Manage Tasks →</button></div>
    {coverError&&<p className="bp-cover-error" role="alert">{coverError}</p>}<div className="bp-feature"><section className={"bp-feature-photo"+(featured&&coverUrls[featured.id]?" bp-custom-cover":featured&&/158\s+putnam/i.test(featured.name+" "+(featured.address||""))?" bp-putnam-cover":"")} style={featured&&coverUrls[featured.id]?{backgroundImage:`linear-gradient(90deg,rgba(9,25,43,.67),rgba(9,25,43,.10)),url("${coverUrls[featured.id]}")`}:undefined}><div><span className="bp-feature-pill">✦ Featured Project</span><h2>{featured?.name||"Your next project starts here"}</h2><p className="bp-cover-description">{featured&&/158\s+putnam/i.test(featured.name+" "+(featured.address||""))?"Residential Townhouses · 3 Units":featured?"Construction Project":"Create a project to get started"}</p></div><div className="bp-cover-actions"><button className="bp-feature-open" onClick={()=>featured?openProject(featured):startCreate()}>{featured?"Open Project →":"Create Project →"}</button></div>{featured&&<div className="bp-cover-corner">{coverPicker(featured,true)}</div>}</section><section className="bp-feature-summary"><h3>Portfolio Overview</h3><div className="bp-feature-row"><span>Projects</span><strong>{live.length}</strong></div><div className="bp-feature-row"><span>Planned Budget</span><strong>{money(budget)}</strong></div><div className="bp-feature-row"><span>Total Spent</span><strong>{money(portfolioSpent)}</strong></div><div className="bp-feature-row"><span>Remaining Budget</span><strong>{money(budget-portfolioSpent)}</strong></div><div className="bp-feature-row"><span>Tasks Completed</span><strong>{portfolioTasks.done} / {portfolioTasks.total}</strong></div></section></div>
    <div className="bp-stats"><div className="bp-stat"><span className="bp-stat-icon">▦</span><div className="bp-stat-label">Total Projects</div><div className="bp-stat-value">{live.length}</div><div className="bp-stat-foot">Excludes archived projects</div></div><div className="bp-stat"><span className="bp-stat-icon">◉</span><div className="bp-stat-label">Active Projects</div><div className="bp-stat-value">{active}</div><div className="bp-stat-foot">Currently marked active</div></div><div className="bp-stat"><span className="bp-stat-icon">$</span><div className="bp-stat-label">Planned Budget</div><div className="bp-stat-value">{money(budget)}</div><div className="bp-stat-foot">Spent: {money(portfolioSpent)} · Remaining: {money(budget-portfolioSpent)}</div></div><div className="bp-stat"><span className="bp-stat-icon">◷</span><div className="bp-stat-label">Planning Projects</div><div className="bp-stat-value">{planning}</div><div className="bp-stat-foot">{completed} projects completed · {portfolioTasks.done}/{portfolioTasks.total} tasks done</div></div></div>
    <section className="bp-panel"><div className="bp-panel-header"><div><p className="bp-eyebrow">Portfolio</p><h2 className="bp-panel-title">Your Projects</h2></div><div className="bp-filter"><label htmlFor="project-filter">Filter</label><select id="project-filter" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All current</option><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select><button className="bp-action" onClick={()=>showForm?(setShowForm(false),setEditingId(null)):startCreate()}>{showForm?"Cancel":"+ New Project"}</button></div></div>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="bp-msg">{message}</p>}
    {showForm&&<form className="bp-form" onSubmit={saveProject}><h3>{editingId?"Edit Project":"New Project"}</h3><div className="formgrid"><div><label>Project name *</label><input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><label>Address</label><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></div><div><label>Status</label><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option>{editingId&&<option value="archived">Archived</option>}</select></div><div><label>Budget (USD)</label><input type="number" min="0" step="0.01" value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})}/></div><div><label>Start date</label><input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></div><div><label>Target end date</label><input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></div></div><p><button className="bp-action" disabled={busy}>{busy?"Saving…":editingId?"Update Project":"Save Project"}</button></p></form>}
    <div className="bp-projects">{shown.length===0?<p className="bp-empty">No projects in this category.</p>:shown.map(p=><article key={p.id} className="bp-project"><div className="bp-projecthead"><button className="bp-projectname" onClick={()=>openProject(p)}>{p.name} ↗</button><span className={"bp-badge "+(p.status==="active"?"active":p.status==="planning"?"planning":"")}>{title(p.status)}</span></div><p className="bp-address">{p.address||"No address added"}</p><div className="bp-projectbudget">{money(p.budget)}</div><div className="bp-small">Planned project budget</div><div className="bp-dates">{date(p.start_date)} → {date(p.end_date)}</div><div className="bp-projectfoot"><button className="bp-open" onClick={()=>openProject(p)}>Open Project →</button>{coverPicker(p)}<button className="bp-open" onClick={()=>startEdit(p)}>Edit</button><button className="bp-archive" onClick={()=>archive(p)}>{p.status==="archived"?"Restore":"Archive"}</button><button className="bp-danger" disabled={busy} onClick={()=>deleteProject(p)}>Delete</button></div></article>)}</div></section>
    <div className="bp-bottom"><section className="bp-panel"><p className="bp-eyebrow">Project pipeline</p><h2 className="bp-panel-title">Status Overview</h2>{[["Planning",planning],["Active",active],["Completed",completed],["On Hold",live.filter(p=>p.status==="on_hold").length]].map(([name,count])=><div className="bp-listrow" key={name}><span>{name}</span><strong>{count}</strong></div>)}</section><section className="bp-panel"><p className="bp-eyebrow">Schedule</p><h2 className="bp-panel-title">Target Completion Dates</h2>{live.filter(p=>p.end_date&&p.status!=="completed").sort((a,b)=>(a.end_date||"").localeCompare(b.end_date||"")).slice(0,4).map(p=><div className="bp-listrow" key={p.id}><span>{p.name}</span><strong>{date(p.end_date)}</strong></div>)}{!live.some(p=>p.end_date&&p.status!=="completed")&&<p className="bp-empty">No upcoming completion dates.</p>}</section></div><p className="bp-empty">Choose Financial Management or Tasks & Schedule in the sidebar to manage live project records.</p>
  </>}
  </main></div>;
}
