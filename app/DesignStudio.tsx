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

export default function DesignStudio({ projectId, userId, unit = 1 }: {projectId:string; userId:string; unit?:number}) {
  const [selectedUnit,setSelectedUnit] = useState(unit);
  const [room,setRoom] = useState<Room>('Kitchen');
  const [values,setValues] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState<string|null>(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  useEffect(()=>setSelectedUnit(unit),[unit]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    const {data,error:e}=await supabase.from('design_selections')
      .select('room,unit_number,field_name,value').eq('project_id',projectId);
    if(e){setError(`DESIGN DATABASE READ: ${e.message}`);setLoading(false);return;}
    const next:Record<string,string>={};
    for(const row of (data||[]) as Selection[]){next[key(row.room as Room,row.unit_number,row.field_name)]=row.value;}
    setValues(next);setLoading(false);
  },[projectId]);
  useEffect(()=>{void load()},[load]);
  const fields=useMemo(()=>room==='Kitchen'?kitchen:bathrooms[selectedUnit]||bathrooms[1],[room,selectedUnit]);
  const storageUnit=room==='Kitchen'?0:selectedUnit; // A single shared kitchen for all three units.
  async function save(field:string,value:string){
    setSaving(field);setError('');setNotice('');
    const {error:e}=await supabase.from('design_selections').upsert({
      project_id:projectId,user_id:userId,room,unit_number:storageUnit,field_name:field,value
    },{onConflict:'project_id,room,unit_number,field_name'});
    if(e)setError(`DESIGN DATABASE SAVE: ${e.message}`);
    else setNotice(`${field} saved.`);
    setSaving(null);
  }
  return <section className="panel" style={{marginTop:20}}>
    <h2>Kitchen &amp; Bathroom Design Studio</h2>
    <p className="muted">Edit and save finishes for this project. Kitchen choices are shared across Units 1–3; bathrooms are independent.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:15}}>
      {[1,2,3].map(n=><button key={n} type="button" className={selectedUnit===n?'':'secondary'} onClick={()=>setSelectedUnit(n)}>Unit {n}</button>)}
    </div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:15}}>
      {(['Kitchen','Bathroom'] as Room[]).map(n=><button key={n} type="button" className={room===n?'':'secondary'} onClick={()=>setRoom(n)}>{n}</button>)}
    </div>
    <h3>{room} Design {room==='Bathroom'?`— Unit ${selectedUnit}`:'— Shared Across All Units'}</h3>
    {loading?<p className="muted">Loading design selections…</p>:<div className="formgrid">
      {fields.map(([field,defaultValue])=>{
        const k=key(room,storageUnit,field);
        const value=values[k]??defaultValue;
        return <div key={k} style={{marginBottom:10}}>
          <label htmlFor={`design-${room}-${storageUnit}-${field.replace(/\W/g,'-')}`}>{field}</label>
          <input id={`design-${room}-${storageUnit}-${field.replace(/\W/g,'-')}`}
            type="text" value={value} placeholder="Enter finish or material"
            onChange={e=>setValues(prev=>({...prev,[k]:e.target.value}))}
            onBlur={()=>{if(value!==(values[k]??defaultValue))return;void save(field,value)}}/>
          <button type="button" className="secondary" disabled={saving===field}
            style={{marginTop:6}} onClick={()=>void save(field,value)}>{saving===field?'Saving…':'Save'}</button>
        </div>;
      })}
    </div>}
    {error&&<p className="error" role="alert">{error}</p>}
    {notice&&<p className="success" role="status">{notice}</p>}
    <p className="muted" style={{fontSize:12}}>Saved choices sync through Supabase. Upload reference images in Photos &amp; Blueprints → Design References for the selected unit.</p>
  </section>;
}
