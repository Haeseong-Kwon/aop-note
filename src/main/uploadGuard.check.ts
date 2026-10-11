import assert from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { assertUploadable } from './attachments'

const dir = mkdtempSync(join(tmpdir(), 'aop-upload-'))
const ok = join(dir, '보고서.pdf')
writeFileSync(ok, 'pdf')
assert.doesNotThrow(() => assertUploadable(ok), 'a normal file')
assert.throws(() => assertUploadable('relative/file.pdf'), /경로/)
assert.throws(() => assertUploadable(join(dir, 'missing.pdf')), /찾을 수 없습니다/)
assert.throws(() => assertUploadable(dir), /폴더는/)
assert.throws(() => assertUploadable(join(app.getPath('userData'), 'aop-note.db')), /찾을 수 없|데이터 폴더/)
writeFileSync(join(app.getPath('userData'), 'ai-key.bin'), 'secret')
assert.throws(() => assertUploadable(join(app.getPath('userData'), 'ai-key.bin')), /데이터 폴더/, "the app's own key file")
mkdirSync(join(app.getPath('home'), '.ssh'), { recursive: true })
writeFileSync(join(app.getPath('home'), '.ssh', 'id_ed25519'), 'key')
assert.throws(() => assertUploadable(join(app.getPath('home'), '.ssh', 'id_ed25519')), /자격 증명/)
writeFileSync(join(app.getPath('home'), '.ssh', '..key'), 'key')
assert.throws(() => assertUploadable(join(app.getPath('home'), '.ssh', '..key')), /자격 증명/, "a file named '..key' is still inside")
assert.equal(assertUploadable(ok), realpathSync(ok), 'returns the resolved path the copy must use')
// A symlink pointing into a protected folder is judged by its target.
const link = join(dir, 'innocent.txt')
symlinkSync(join(app.getPath('home'), '.ssh', 'id_ed25519'), link)
assert.throws(() => assertUploadable(link), /자격 증명/, 'symlinks resolved')
console.log('upload guard: all assertions passed')
