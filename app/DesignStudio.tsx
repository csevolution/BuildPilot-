"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Room = 'Kitchen' | 'Bathroom';
type Selection = { field_name: string; value: string; room: string; unit_number: number };

const kitchen: [string, string][] = [
  ['Upper Cabinets', 'White'], ['Lower Cabinets', 'Natural Oak'],
  ['Kitchen Island', 'White'], ['Countertops', 'White Quartz'],
  ['Island Edge', 'Double-Sided Waterfall (both sides to floor)'],
  ['Backsplash', 'White Quartz Slab'], ['Flooring', 'Warm Medium Oak'],
  ['Pendant Lights', 'Clear Glass Globes'], ['Cabinet Hardware', 'Matte Black'],
  ['Kitchen Faucet', 'Matte Black'], ['Range Hood', 'Concealed / Integrated']
];
const bathrooms: Record<number, [string,string][]> = {
  1: [['Vanity','Natural Oak'],['Countertop','Pure White Quartz'],['Wall Tile','White Marble-Look Porcelain'],['Floor Tile','Warm Beige Porcelain'],['Mirror','LED Backlit'],['Fixtures','Matte Black']],
  2: [['Vanity',''],['Countertop',''],['Wall Tile',''],['Floor Tile',''],['Mirror',''],['Fixtures','']],
  3: [['Vanity',''],['Countertop',''],['Wall Tile',''],['Floor Tile',''],['Mirror',''],['Fixtures','']]
};
const key = (room:Room, unit:number, field:string) => `${room}:${unit}:${field}`;

function finishColor(value:string):string {
  const v=value.toLowerCase();
  if(!v.trim())return 'linear-gradient(135deg,#f0f3f8,#e7ecf3)';
  if(v.includes('walnut'))return 'linear-gradient(135deg,#5d3928,#8b5b40)';
  if(v.includes('oak'))return 'linear-gradient(135deg,#c49a67,#e2c29b)';
  if(v.includes('black'))return 'linear-gradient(135deg,#222b36,#536171)';
  if(v.includes('beige'))return 'linear-gradient(135deg,#d8c6ac,#f2e7d7)';
  if(v.includes('marble'))return 'linear-gradient(130deg,#f8f8f5 10%,#c9cfd1 38%,#fff 48%,#e7e8e5 72%)';
  if(v.includes('quartz')||v.includes('white'))return 'linear-gradient(135deg,#fff,#e8edf0)';
  if(v.includes('glass')||v.includes('led'))return 'linear-gradient(135deg,#dceef9,#f9fcff)';
  return 'linear-gradient(135deg,#dbe8f5,#f1f5fa)';
}

export default function DesignStudio({ projectId, userId, unit = 1 }: {projectId:string; userId:string; unit?:number}) {
  const [selectedUnit,setSelectedUnit] = useState(unit);
  const [room,setRoom] = useState<Room>('Kitchen');
  const [values,setValues] = useState<Record<string,string>>({});
  const [savedValues,setSavedValues] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState<string|null>(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  useEffect(()=>setSelectedUnit(unit),[unit]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    const {data,error:e}=await supabase.from('design_selections')
      .select('room,unit_number,field_name,value').eq('project_id',projectId).eq('user_id',userId);
    if(e){setError(`DESIGN DATABASE READ: ${e.message}`);setLoading(false);return;}
    const next:Record<string,string>={};
    for(const row of (data||[]) as Selection[]){next[key(row.room as Room,row.unit_number,row.field_name)]=row.value;}
    setValues(next);setSavedValues(next);setLoading(false);
  },[projectId,userId]);
  useEffect(()=>{void load()},[load]);
  const fields=useMemo(()=>room==='Kitchen'?kitchen:bathrooms[selectedUnit]||bathrooms[1],[room,selectedUnit]);
  const storageUnit=room==='Kitchen'?0:selectedUnit;
  const filled=fields.filter(([field,defaultValue])=>(values[key(room,storageUnit,field)]??defaultValue).trim()).length;
  async function save(field:string,value:string){
    const k=key(room,storageUnit,field);
    setSaving(k);setError('');setNotice('');
    const {error:e}=await supabase.from('design_selections').upsert({
      project_id:projectId,user_id:userId,room,unit_number:storageUnit,field_name:field,value
    },{onConflict:'project_id,room,unit_number,field_name'});
    if(e)setError(`DESIGN DATABASE SAVE: ${e.message}`);
    else {setSavedValues(prev=>({...prev,[k]:value}));setNotice(`${field} saved successfully.`);}
    setSaving(null);
  }
  return <section className="bp-design" style={{marginTop:22}}>
    <style>{`
      .bp-design{color:#20334c;font-family:inherit}.bp-design *{box-sizing:border-box}
      .bp-design-header{padding:26px;border-radius:24px;background:linear-gradient(125deg,#f9fbff,#eaf2fc);border:1px solid #dce7f3;margin-bottom:18px}
      .bp-design-eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:800;color:#5683b6;margin:0 0 9px}
      .bp-design h2{font-size:clamp(25px,3vw,34px);letter-spacing:-1px;margin:0 0 10px;color:#18334f}
      .bp-design-desc{font-size:14px;line-height:1.65;color:#6b7f94;margin:0}
      .bp-design-toolbar{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin:19px 0}
      .bp-design-switch{display:flex;flex-wrap:wrap;gap:7px;background:#edf2f8;border-radius:15px;padding:5px}
      .bp-design-switch button{border:0!important;border-radius:11px!important;background:transparent!important;color:#60768c!important;font-weight:750!important;padding:10px 15px!important;font-size:13px!important;box-shadow:none!important}
      .bp-design-switch button.bp-design-selected{background:#fff!important;color:#2262a1!important;box-shadow:0 2px 9px #1c395514!important}
      .bp-design-panel{background:#fff;border:1px solid #e3eaf3;border-radius:22px;padding:24px;margin-bottom:18px;box-shadow:0 8px 24px #1c395508}
      .bp-design-heading{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
      .bp-design-heading h3{font-size:21px;letter-spacing:-.6px;margin:0;color:#20334c}
      .bp-design-pill{border-radius:99px;background:#eaf6ef;color:#2c8052;padding:8px 12px;font-size:12px;font-weight:750}
      .bp-design-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
      .bp-design-item{border:1px solid #e3eaf1;border-radius:17px;padding:15px;background:#fcfdff;min-width:0}
      .bp-design-item-head{display:flex;gap:12px;align-items:center;margin-bottom:13px}
      .bp-design-swatch{width:52px;height:52px;flex:none;border:1px solid #d9e1e9;border-radius:13px;box-shadow:inset 0 0 0 1px #ffffff80}
      .bp-design-item label{font-size:13px;font-weight:800;color:#253d56;display:block;margin:0 0 3px}
      .bp-design-caption{font-size:11px;color:#8b9bae;margin:0}
      .bp-design-item input{width:100%;max-width:100%;min-width:0;border:1px solid #dbe4ed!important;border-radius:11px!important;padding:12px!important;font-size:13px!important;background:#fff!important;color:#20334c!important}
      .bp-design-item-foot{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-top:10px}
      .bp-design-save{background:#256ab0!important;color:white!important;border:0!important;border-radius:10px!important;padding:9px 15px!important;font-size:12px!important;font-weight:800!important}
      .bp-design-save:disabled{opacity:.6}.bp-design-state{font-size:11px;color:#8497a9}
      .bp-design-reference{background:linear-gradient(120deg,#eef6fd,#f8fbff);border:1px solid #e0eaf4;border-radius:19px;padding:20px}
      .bp-design-reference h3{font-size:17px;margin:0 0 7px;color:#20334c}.bp-design-reference p{color:#6b7f94;font-size:13px;line-height:1.6;margin:0}
      .bp-design-note{font-size:12px;color:#7a8b9e;margin:12px 0 0}
      @media(max-width:680px){.bp-design-header,.bp-design-panel{padding:19px}.bp-design-grid{grid-template-columns:1fr}.bp-design-toolbar{align-items:stretch}.bp-design-switch{justify-content:center}}
    `}</style>
    <div className="bp-design-header">
      <p className="bp-design-eyebrow">BuildPilot / Design Studio</p>
      <h2>Spaces, beautifully planned.</h2>
      <p className="bp-design-desc">A refined home for kitchen and bathroom finishes. Kitchen selections are shared across all three units; each bathroom has its own palette.</p>
    </div>
    <div className="bp-design-toolbar">
      <div className="bp-design-switch" aria-label="Choose unit">{[1,2,3].map(n=><button key={n} type="button" className={selectedUnit===n?'bp-design-selected':''} aria-pressed={selectedUnit===n} onClick={()=>{setSelectedUnit(n);setNotice('')}}>Unit {n}</button>)}</div>
      <div className="bp-design-switch" aria-label="Choose room">{(['Kitchen','Bathroom'] as Room[]).map(n=><button key={n} type="button" className={room===n?'bp-design-selected':''} aria-pressed={room===n} onClick={()=>{setRoom(n);setNotice('')}}>{n}</button>)}</div>
    </div>
    <div className="bp-design-panel">
      <div className="bp-design-heading"><h3>{room==='Kitchen'?'Kitchen · Shared Design':`Bathroom · Unit ${selectedUnit}`}</h3><span className="bp-design-pill">{filled} / {fields.length} finishes selected</span></div>
      {loading?<p className="bp-design-desc">Loading design selections…</p>:<div className="bp-design-grid">
        {fields.map(([field,defaultValue])=>{
          const k=key(room,storageUnit,field);
          const value=values[k]??defaultValue;
          const original=savedValues[k]??defaultValue;
          return <div key={k} className="bp-design-item">
            <div className="bp-design-item-head"><span className="bp-design-swatch" aria-hidden="true" style={{background:finishColor(value)}}/><div><label htmlFor={`bp-design-${room}-${storageUnit}-${field.replace(/\W/g,'-')}`}>{field}</label><p className="bp-design-caption">{value.trim()?'Selected finish':'Awaiting selection'}</p></div></div>
            <input id={`bp-design-${room}-${storageUnit}-${field.replace(/\W/g,'-')}`} type="text" value={value} placeholder="Enter finish or material" onChange={e=>setValues(prev=>({...prev,[k]:e.target.value}))}/>
            <div className="bp-design-item-foot"><span className="bp-design-state">{value===original?'No unsaved changes':'Unsaved changes'}</span><button type="button" className="bp-design-save" disabled={saving!==null} onClick={()=>void save(field,value)}>{saving===k?'Saving…':'Save finish'}</button></div>
          </div>;
        })}
      </div>}
      {error&&<p className="error" role="alert">{error}</p>}
      {notice&&<p className="success" role="status">{notice}</p>}
    </div>
    <div className="bp-design-reference"><h3>Design references & inspiration</h3><p>Keep reference photos, drawings, and material inspiration together in <strong>Photos &amp; Blueprints → Design References</strong>. This panel is a guide; photos are not yet embedded here.</p></div>
    <p className="bp-design-note">Finish selections are saved to Supabase. Color swatches are illustrative previews, not exact manufacturer samples.</p>
  </section>;
}
