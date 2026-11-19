"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type FileRow = {
  id: string;
  project_id: string;
  user_id: string;
  unit_number: number | null;
  category: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

const BUCKET = 'project-files';
const MAX_BYTES = 20 * 1024 * 1024;
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
};
const CATEGORIES = [
  'Construction Photos', 'Kitchen Design', 'Bathroom Design',
  'Architectural Plans', 'Design References',
];

export default function ProjectFiles({ projectId, userId, unit }: {
  projectId: string;
  userId: string;
  unit: number | null;
}) {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [category, setCategory] = useState('Design References');
  const [filter, setFilter] = useState('All');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [changingCategory, setChangingCategory] = useState<string | null>(null);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const query = supabase.from('project_files').select('*')
      .eq('project_id', projectId).eq('user_id', userId)
      .order('created_at', { ascending: false });
    const { data, error: readError } = unit === null
      ? await query.is('unit_number', null)
      : await query.eq('unit_number', unit);
    if (version !== loadVersion.current) return;
    if (readError) { setError('DATABASE READ: ' + readError.message); return; }

    const rows = (data || []) as FileRow[];
    setFiles(rows);
    // Storage stays private: temporary signed URLs are used for thumbnails.
    const signed = await Promise.all(rows.filter(row => row.mime_type.startsWith('image/'))
      .map(async row => {
        const { data } = await supabase.storage.from(BUCKET)
          .createSignedUrl(row.storage_path, 3600);
        return [row.id, data?.signedUrl || ''] as const;
      }));
    if (version === loadVersion.current) setPreviewUrls(Object.fromEntries(signed));
  }, [projectId, userId, unit]);

  useEffect(() => {
    setError(''); setNotice(''); setFilter('All');
    void load();
    return () => { loadVersion.current++; };
  }, [load]);

  async function upload(selected: FileList | null) {
    if (!selected?.length || uploading) return;
    setError(''); setNotice(''); setUploading(true);
    let count = 0;
    try {
      for (const file of Array.from(selected)) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const mime = EXT_MIME[ext];
        if (!mime || (file.type && file.type !== mime && !(ext === 'jpg' && file.type === 'image/jpeg')))
          throw Error('Only JPG, PNG, HEIC and PDF files are supported.');
        if (file.size > MAX_BYTES) throw Error(`${file.name} exceeds the 20 MB limit.`);
        const id = crypto.randomUUID();
        const path = `${userId}/${projectId}/${id}.${ext}`;
        const { error: storageError } = await supabase.storage.from(BUCKET)
          .upload(path, file, { contentType: mime, upsert: false });
        if (storageError) throw Error('STORAGE UPLOAD: ' + storageError.message);
        const { error: dbError } = await supabase.from('project_files').insert({
          id, project_id: projectId, user_id: userId, unit_number: unit,
          category, file_name: file.name, storage_path: path,
          mime_type: mime, size_bytes: file.size,
        });
        if (dbError) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw Error('DATABASE INSERT: ' + dbError.message);
        }
        count++;
      }
      setNotice(`${count} file${count === 1 ? '' : 's'} uploaded successfully.`);
      setFilter('All');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
      await load();
    }
  }

  async function openFile(row: FileRow) {
    setOpening(row.id); setError('');
    try {
      const { data, error } = await supabase.storage.from(BUCKET)
        .createSignedUrl(row.storage_path, 300);
      if (error) throw Error('STORAGE VIEW: ' + error.message);
      if (!data?.signedUrl) throw Error('Could not generate a file link.');
      // Open directly after the URL is ready. The fallback is a visible link.
      const newTab = window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      if (!newTab) {
        setPreviewUrls(prev => ({ ...prev, [row.id]: data.signedUrl }));
        setNotice('If the file did not open, tap its preview or the Open file link.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open file.');
    } finally { setOpening(null); }
  }

  async function removeFile(row: FileRow) {
    if (!window.confirm(`Delete ${row.file_name}? This cannot be undone.`)) return;
    setDeleting(row.id); setError(''); setNotice('');
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET)
        .remove([row.storage_path]);
      if (storageError) throw Error('STORAGE DELETE: ' + storageError.message);
      const { error: dbError } = await supabase.from('project_files')
        .delete().eq('id', row.id).eq('user_id', userId);
      if (dbError) throw Error('DATABASE DELETE: ' + dbError.message);
      setNotice('File deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete file.');
    } finally { setDeleting(null); }
  }

  // Only filenames with a clear kitchen/bathroom label are suggested for organization.
  // The file in private storage is never moved, deleted, or re-uploaded.
  function suggestedCategory(row: FileRow): string | null {
    if (row.category !== 'Design References') return null;
    if (/kitchen/i.test(row.file_name)) return 'Kitchen Design';
    if (/bathroom/i.test(row.file_name)) return 'Bathroom Design';
    return null;
  }

  async function changeFileCategory(row: FileRow, nextCategory: string) {
    if (row.category === nextCategory || changingCategory || organizing) return;
    setChangingCategory(row.id); setError(''); setNotice('');
    try {
      const { data, error: updateError } = await supabase.from('project_files')
        .update({ category: nextCategory })
        .eq('id', row.id).eq('project_id', projectId).eq('user_id', userId)
        .select('id');
      if (updateError) throw Error('DATABASE UPDATE: ' + updateError.message);
      if (!data?.length) throw Error('Category was not updated. Check database update permissions.');
      setFiles(prev => prev.map(f => f.id === row.id ? { ...f, category: nextCategory } : f));
      setNotice(`Updated category for ${row.file_name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change category.');
    } finally { setChangingCategory(null); }
  }

  const suggestedFiles = files.map(row => ({ row, nextCategory: suggestedCategory(row) }))
    .filter((item): item is { row: FileRow; nextCategory: string } => item.nextCategory !== null);

  async function organizeExistingFiles() {
    if (!suggestedFiles.length || organizing || changingCategory) return;
    const kitchenCount = suggestedFiles.filter(item => item.nextCategory === 'Kitchen Design').length;
    const bathroomCount = suggestedFiles.filter(item => item.nextCategory === 'Bathroom Design').length;
    const confirmed = window.confirm(
      `Update categories for ${suggestedFiles.length} existing files?\n` +
      `${kitchenCount} Kitchen Design; ${bathroomCount} Bathroom Design.\n\n` +
      'Only category labels in the database will change. No files will be deleted or moved.'
    );
    if (!confirmed) return;
    setOrganizing(true); setError(''); setNotice('');
    let updated = 0;
    try {
      for (const { row, nextCategory } of suggestedFiles) {
        const { data, error: updateError } = await supabase.from('project_files')
          .update({ category: nextCategory })
          .eq('id', row.id).eq('project_id', projectId).eq('user_id', userId)
          .select('id');
        if (updateError) throw Error('DATABASE UPDATE: ' + updateError.message);
        if (!data?.length) throw Error('Category was not updated. Check database update permissions.');
        updated++;
      }
      setNotice(`${updated} file categor${updated === 1 ? 'y' : 'ies'} organized successfully. No files were deleted.`);
    } catch (e) {
      setError(`${updated} of ${suggestedFiles.length} categories updated. ` +
        (e instanceof Error ? e.message : 'Could not finish organizing.'));
    } finally {
      setOrganizing(false);
      setFilter('All');
      await load();
    }
  }

  const visibleFiles = filter === 'All' ? files : files.filter(row => row.category === filter);
  const cardStyle = { border: '1px solid #dae2ea', borderRadius: 14, overflow: 'hidden' as const, background: '#fff', minWidth: 0 };

  return <section className="panel" style={{ marginTop: 20 }}>
    <h2>Photos &amp; Blueprints</h2>
    <p className="muted">{unit === null ? 'Project Files' : `Unit ${unit} Files`} · Private storage</p>

    <div className="formgrid">
      <div>
        <label htmlFor="file-category">File category</label>
        <select id="file-category" value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="project-upload">Upload photos or PDF (max 20 MB each)</label>
        <input id="project-upload" type="file" multiple
          accept=".jpg,.jpeg,.png,.heic,.heif,.pdf,image/jpeg,image/png,image/heic,image/heif,application/pdf"
          disabled={uploading}
          onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
    {uploading && <p className="muted" role="status">Uploading… Please keep this page open.</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="success" role="status">{notice}</p>}

    <h3 style={{ marginTop: 28, marginBottom: 12 }}>Visual Gallery</h3>
    {suggestedFiles.length > 0 && <div style={{ marginBottom: 16, padding: 14, background: '#f3f6fa', borderRadius: 12 }}>
      <strong>Organize existing design images</strong>
      <p className="muted" style={{ margin: '6px 0 10px' }}>
        {suggestedFiles.length} file(s) labeled Kitchen or Bathroom can be moved to their proper gallery categories.
        This only changes category labels; your private files stay in place.
      </p>
      <button type="button" disabled={organizing || changingCategory !== null}
        onClick={() => void organizeExistingFiles()}>
        {organizing ? 'Organizing…' : `Organize ${suggestedFiles.length} files`}
      </button>
    </div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      {['All', ...CATEGORIES].map(c => <button key={c} type="button"
        className={filter === c ? '' : 'secondary'}
        onClick={() => setFilter(c)}>{c}</button>)}
    </div>

    {visibleFiles.length === 0 ? <p className="muted">
      {files.length ? 'No files in this category yet.' : 'No files uploaded yet. Choose a category and upload your first photo.'}
    </p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 14 }}>
      {visibleFiles.map(row => {
        const isPdf = row.mime_type === 'application/pdf';
        const isHeic = /hei[cf]/i.test(row.mime_type);
        const imageUrl = previewUrls[row.id];
        return <div key={row.id} style={cardStyle}>
          <div style={{ height: 170, background: '#eef2f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {!isPdf && !isHeic && imageUrl
              ? <img src={imageUrl} alt={row.file_name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span aria-hidden="true" style={{ fontSize: 52 }}>{isPdf ? '📄' : '📷'}</span>}
          </div>
          <div style={{ padding: 12 }}>
            <strong style={{ display: 'block', overflowWrap: 'anywhere', marginBottom: 6 }}>{row.file_name}</strong>
            <small className="muted" style={{ display: 'block', marginBottom: 10 }}>
              {row.category} · {(row.size_bytes / 1024 / 1024).toFixed(1)} MB · {new Date(row.created_at).toLocaleDateString('en-US')}
            </small>
            <label htmlFor={`category-${row.id}`} style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Change category</label>
            <select id={`category-${row.id}`} value={row.category}
              disabled={changingCategory === row.id || organizing}
              onChange={e => void changeFileCategory(row, e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <button type="button" className="secondary" disabled={opening === row.id}
                onClick={() => void openFile(row)}>{opening === row.id ? 'Opening…' : 'View'}</button>
              <button type="button" className="secondary" disabled={deleting === row.id}
                onClick={() => void removeFile(row)}>{deleting === row.id ? 'Deleting…' : 'Delete'}</button>
            </div>
            {opening === null && imageUrl && <a href={imageUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: 8, fontSize: 13 }}>Open file</a>}
          </div>
        </div>;
      })}
    </div>}
    <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
      Files remain private and linked to your account. HEIC photos may not show a thumbnail on some browsers; use View instead. Temporary previews expire after one hour; refresh the page to renew them.
    </p>
  </section>;
}
