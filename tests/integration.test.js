// Integration test — real src/api modules → real client → fake server (src/mocks).
// No browser, no test runner. Run from the project root (needs esbuild):
//
//   npx esbuild tests/integration.test.js --bundle --platform=node --format=esm \
//     --alias:@=./src --loader:.js=jsx \
//     --define:import.meta.env='{"DEV":false,"VITE_USE_MOCK":"true"}' \
//     --outfile=/tmp/int.mjs && node /tmp/int.mjs
//
// Prints "ok" / "FAIL" per check; exit code 1 on any failure. Also run it with
// "VITE_API_BASE_URL":"http://localhost:5000/api" added to the define above.
// Replace with vitest in Phase 10 of plan.md.
// Integration test: real api modules → real client → fake server (src/mocks).
const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=v}, removeItem:k=>{delete store[k]} };
window.location = { origin: "http://localhost" };
window.addEventListener = () => {};
const assert = (c,m)=>{ if(!c){console.log("FAIL:",m);process.exitCode=1}else console.log("ok  :",m) };

const { installMockServer } = await import("@/mocks/server");
const { db } = await import("@/mocks/db");
const client = await import("@/api/client");
const { login, fetchMe } = await import("@/api/auth");
const T = await import("@/api/tests"); const A = await import("@/api/attempts"); const G = await import("@/api/grades");
const cache = await import("@/api/cache");
installMockServer({ baseUrl: client.BASE_URL, latency: [0, 1] });
client.setAuthToken(null);

const as = async (role) => { const s = await login({ email: "", password: "x", role }); client.setAuthToken(s.token); return s.user; };
const get = (p) => client.call(p);
const code = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

// ── auth & wire ──
let e = await code(() => get("/tests"));
assert(e?.status===401, "no token → 401");
let unauthorized = 0; client.onUnauthorized(()=>{unauthorized++}); await code(() => get("/tests"));
assert(unauthorized===1, "401 calls the registered handler");
const teacher = await as("teacher");
assert(teacher.role==="teacher" && teacher.id && (await fetchMe()).name===teacher.name, "login + /auth/me (ids adapted)");
const raw = await (await fetch(client.BASE_URL + "/tests", { headers: { Authorization: `Bearer mock.${teacher.id}` } })).json();
assert(raw[0]._id && !("id" in raw[0]) && typeof raw[0].createdAt==="string" && /T.*Z$/.test(raw[0].createdAt), "wire: server sends _id + ISO dates");
const tests = await get("/tests");
assert(tests[0].id && typeof tests[0].createdAt==="number", "client adapts: id + ms timestamps");

// ── teacher list ──
const by = (t) => tests.find(x=>x.title===t);
const exp = { "Wave Optics — Quiz 2":["live",10,30], "Newton's Laws — Unit Test":["draft",12,40], "Thermodynamics — Mid-term":["scheduled",15,60], "Bonding & Structure":["draft",10,30], "Kinematics — Quiz":["completed",8,25] };
for (const [t,[s,q,m]] of Object.entries(exp)) assert(by(t).status===s && by(t).questionCount===q && by(t).totalMarks===m, `${t}: ${s} ${q}q ${m}m`);
assert(by("Wave Optics — Quiz 2").settings.release==="after_close", "settings come back complete (defaults)");

// ── role scoping ──
await as("student");
const sTests = await get("/tests");
assert(sTests.length===8 && !sTests.some(t=>t.status==="draft"), "student sees only published tests (3 current + 5 past)");
assert(sTests.every(t=>!("questionSet" in t) && !("variants" in t) && t.questionCount>0 && t.totalMarks>0), "student tests carry no questions, but counts");
e = await code(() => T.generateTest({ mix:[{type:"mcq",count:1,marks:1}], mode:"class" }));
assert(e?.status===403, "student can't generate a test");
await as("teacher");
e = await code(() => G.reviewGrade("x","y",{marks:1})); assert(e?.status===404, "unknown grade → 404");
await as("student"); e = await code(() => get("/grading/queue")); assert(e?.status===403, "student can't read the grading queue");
await as("teacher");

// ── generate / edit / publish ──
const cfg = { subjectId:"sub-phys-11a", title:"", mix:[{type:"mcq",count:3,marks:2},{type:"truefalse",count:2,marks:1},{type:"short",count:2,marks:4}], targetMarks:16, duration:20, mode:"class", difficulty:"balanced", focusTopics:["Kinematics","Gravitation"], instruction:"", classId:"cls-11a", cls:"11A", subject:"Physics" };
const t1 = await T.generateTest(cfg);
assert(t1.status==="draft" && t1.questionSet.length===7 && t1.title==="Kinematics & Gravitation — Test" && t1.questionCount===7 && t1.totalMarks===16, "generate: draft, 7 questions, auto title, counts");
e = await code(() => T.generateTest({...cfg, mix:[]})); assert(e?.status===400, "empty mix → 400");
const broken = t1.questionSet.map((q,i)=> i===0 ? {...q, correctIndex:null} : q);
await T.saveTest(t1.id, { questionSet: broken });
e = await code(() => T.publishTest(t1.id)); assert(e?.status===400 && e.code==="INVALID_QUESTIONS", "publish with an invalid question → 400");
await T.saveTest(t1.id, { questionSet: t1.questionSet });
const regen = await T.regenerateTest(t1.id); assert(regen.questionSet[0].id!==t1.questionSet[0].id && regen.regenCount===1, "regenerate replaces questions");
const dup = await T.duplicateTest(t1.id); assert(dup.title.endsWith("(copy)") && dup.status==="draft" && dup.questionSet[0].id!==regen.questionSet[0].id, "duplicate: new id/questions, draft");
await T.publishTest(t1.id, { settings: { release:"immediately", aiGrading:true, allowBack:false } });
let t1s = (await get("/tests")).find(t=>t.id===t1.id);
assert(t1s.status==="live" && t1s.settings.allowBack===false && t1s.settings.release==="immediately", "publish now → live, settings stored");
e = await code(() => T.saveTest(t1.id, { title:"x" })); assert(e?.status===409 && e.code==="NOT_EDITABLE", "editing a live test → 409");
e = await code(() => T.deleteTest(t1.id)); assert(e?.status===409, "can't delete a live test");

// schedule + start now
const from = Date.now()+3_600_000;
await T.publishTest(dup.id, { availableFrom: from, availableUntil: from+7_200_000 });
let d1 = (await get("/tests")).find(t=>t.id===dup.id);
assert(d1.status==="scheduled" && d1.schedule.availableFrom===from, "schedule → scheduled (ISO round-trips to ms)");
await T.startTestNow(dup.id);
d1 = (await get("/tests")).find(t=>t.id===dup.id);
assert(d1.status==="live" && d1.schedule.availableUntil===from+7_200_000, "start now → live, keeps close time");

// ── student takes the test ──
await as("student");
const stuTests = await get("/tests");
assert(stuTests.some(t=>t.id===t1.id), "student now sees the new live test");
const att = await A.startAttempt(t1.id);
assert(att.status==="in_progress" && att.questions.length===7 && att.deadline-att.startedAt===20*60_000, "start: attempt with 20-min deadline");
assert(att.questions.every(q=>!("correctIndex" in q) && !("expectedAnswer" in q) && !("rubric" in q)), "attempt questions carry no answer key");
assert(!("grades" in att) && att.released===false && att.totals===null, "attempt: no grades, not released");
assert((await A.startAttempt(t1.id)).id===att.id, "start twice → same attempt");
const sched = (await get("/tests")).find(t=>t.title==="Thermodynamics — Mid-term");
e = await code(() => A.startAttempt(sched.id)); assert(e?.status===409 && e.code==="NOT_OPEN", "scheduled test → 409 NOT_OPEN");
const ls = await T.getLiveStatus(t1.id); assert(ls.stopped===false && ls.deadline===att.deadline, "live-status: not stopped, own deadline");

const mc = att.questions.filter(q=>q.options);
await A.saveAnswer(att.id, mc[0].id, 1);
await A.logFlag(t1.id, "tab-switch");
const mine = (await get("/attempts")).find(a=>a.id===att.id);
assert(mine.answers[mc[0].id]===1 && mine.flags.length===1, "answers + flags saved");
// answer all choices by the key (look it up server-side for the test)
const full = db().tests.find(t=>t.id===t1.id).questionSet;
const answers = {}; full.forEach(q => { if (q.options) answers[q.id] = q.correctIndex; else answers[q.id] = q.expectedAnswer; });
const res = await A.submitAttempt(t1.id, { reason:"manual", answers });
assert(res.status==="submitted" && res.released===true && res.totals.earned===full.filter(q=>q.options).reduce((s,q)=>s+q.marks,0), "submit (release: immediately): released, objective marks counted");
assert(res.totals.complete===false && res.totals.notFinal===2, "submit: 2 written answers not final yet");
assert((await A.submitAttempt(t1.id, { reason:"timeout" })).submitReason==="manual", "submit idempotent");

// ── review gating ──
const review = await get(`/attempts/${att.id}/review`);
assert(review.items.length===7 && review.items.every(i=>"correctIndex" in i), "review (immediately): available with answers");
assert(review.items.filter(i=>i.grade.status!=="final").every(i=>!("marks" in i.grade)), "non-final grades expose no marks");

// after_close test: hidden until it ends
await as("teacher");
const t2 = await T.generateTest({...cfg, title:"After close"}); await T.publishTest(t2.id);
await as("student");
const a2 = await A.startAttempt(t2.id); await A.submitAttempt(t2.id, { reason:"manual" });
e = await code(() => get(`/attempts/${a2.id}/review`)); assert(e?.status===403 && e.code==="NOT_RELEASED", "after_close: review → 403 NOT_RELEASED while live");
const listed = (await get("/attempts")).find(a=>a.id===a2.id); assert(listed.released===false && listed.totals===null, "after_close: attempt shows released:false, totals:null");
await as("teacher"); await T.stopTestNow(t2.id);
await as("student");
assert((await get(`/attempts/${a2.id}/review`)).totals, "after_close: released once the test ends");
assert((await get("/attempts")).find(a=>a.id===a2.id).released===true, "attempt flips to released");
assert((await T.getLiveStatus(t2.id)).stopped===true, "live-status: stopped");

// ── server-side sweep: timeout & stop grace ──
await as("teacher");
const t3 = await T.generateTest({...cfg, title:"Sweep"}); await T.publishTest(t3.id);
await as("student"); const a3 = await A.startAttempt(t3.id);
db().attempts.find(a=>a.id===a3.id).deadline = Date.now()-1000;
const swept = (await get("/attempts")).find(a=>a.id===a3.id);
assert(swept.status==="submitted" && swept.submitReason==="timeout", "server closes an attempt past its deadline (timeout)");
await as("teacher");
const t4 = await T.generateTest({...cfg, title:"Stopped"}); await T.publishTest(t4.id);
await as("student"); const a4 = await A.startAttempt(t4.id);
await as("teacher"); await T.stopTestNow(t4.id);
await as("student");
assert((await get("/attempts")).find(a=>a.id===a4.id).status==="in_progress", "after a stop the student has a grace period to submit themselves");
db().tests.find(t=>t.id===t4.id).stoppedAt = Date.now()-31_000;
assert((await get("/attempts")).find(a=>a.id===a4.id).submitReason==="stopped", "…then the server closes it (stopped)");

// ── roster + extend ──
await as("teacher");
const roster = await get(`/tests/${t1.id}/attempts`);
assert(roster.length===6 && roster.every(r=>r.student.name && r.student.roll), "roster: one row per class student");
const mayRow = roster.find(r=>r.student.name==="Maya Okafor");
assert(mayRow.attempt.status==="submitted" && mayRow.attempt.progress.total===7 && mayRow.attempt.progress.answered===7 && mayRow.attempt.flags.length===1 && !("answers" in mayRow.attempt), "roster: progress + flags, never the answers");
assert(roster.filter(r=>!r.attempt).length===5, "roster: others haven't started");
const t5 = await T.generateTest({...cfg, title:"Extend"}); const until = Date.now()+3_600_000;
await T.publishTest(t5.id, { availableUntil: until });
await as("student"); const a5 = await A.startAttempt(t5.id);
await as("teacher"); const ext = await T.extendTest(t5.id, 15);
assert(ext.closesAt===until+900_000, "extend: new close time");
await as("student");
assert((await T.getLiveStatus(t5.id)).deadline===a5.deadline+900_000, "extend reaches the open attempt (via live-status deadline)");
await as("teacher"); await T.stopTestNow(t5.id);
e = await code(() => T.extendTest(t5.id, 5)); assert(e?.status===409, "can't extend an ended test");

// ── grading ──
let queue = await get("/grading/queue");
const kin = queue.filter(i=>i.test==="Kinematics — Quiz");
assert(kin.length===18 && kin.every(i=>!i.manual && i.status==="pending" && i.submittedAt>0), "queue: 6 students × 3 written answers");
assert(new Set(kin.map(i=>i.confidence)).size>=2, "queue: spread of confidence");
assert(kin.find(i=>i.student==="Adrian Bell").flags===2 && kin.find(i=>i.student==="Tomás Reyes").roll==="11A-28", "queue: flags + roll");
const target = kin.find(i=>i.student==="Priya Nair");
await G.reviewGrade(target.attemptId, target.questionId, { marks: target.maxScore, feedback:"Good", final:true, reason:"Matches the model answer" });
queue = await get("/grading/queue");
let q1 = queue.find(i=>i.id===target.id);
assert(q1.status==="reviewed" && q1.score===target.maxScore && q1.source==="teacher" && q1.feedback==="Good" && q1.aiScore===target.aiScore, "override: reviewed, teacher source, AI suggestion kept");
e = await code(() => G.reviewGrade(target.attemptId, target.questionId, { marks: target.maxScore+1 })); assert(e?.status===400 && e.code==="INVALID_MARKS", "marks above max → 400 INVALID_MARKS");
const hi = queue.filter(i=>i.status==="pending" && i.confidence==="high" && !i.manual);
const ap = await G.approveGrades(hi.map(i=>({attemptId:i.attemptId, questionId:i.questionId})));
assert(ap.approved===hi.length && hi.length>0, `bulk approve ${ap.approved} high-confidence`);
assert((await G.approveGrades(hi.map(i=>({attemptId:i.attemptId, questionId:i.questionId})))).approved===0, "approve idempotent");
queue = await get("/grading/queue");
assert(queue.filter(i=>i.status==="pending" && i.confidence==="high" && !i.manual).length===0 && queue.some(i=>i.status==="pending"), "low/med confidence still need review");

// AI off → manual queue
const t6 = await T.generateTest({...cfg, title:"No AI"}); await T.publishTest(t6.id, { settings:{ aiGrading:false } });
await as("student"); const a6 = await A.startAttempt(t6.id);
const wq = a6.questions.find(q=>!q.options);
await A.submitAttempt(t6.id, { reason:"manual", answers:{ [wq.id]:"my answer" } });
await as("teacher");
const m = (await get("/grading/queue")).find(i=>i.attemptId===a6.id && i.questionId===wq.id);
assert(m.manual===true && m.status==="pending" && m.score===null && m.answer==="my answer", "AI off → manual item, no mark");
await G.reviewGrade(a6.id, wq.id, { marks:2, feedback:"ok", final:true });
assert((await get("/grading/queue")).find(i=>i.id===m.id).status==="reviewed", "manual mark saved");

// finished students see only final marks
await as("student");
const kinAttempt = (await get("/attempts")).find(a=>a.testId===by("Kinematics — Quiz").id);
assert(kinAttempt.released===true && kinAttempt.totals.max===25 && kinAttempt.totals.earned>=10, "student: Kinematics released, totals from final marks");

// ── classes & subjects ──
const S = await import("@/api/subjects");
await as("teacher");
const tClasses = await get("/classes"), tSubjects = await get("/subjects");
assert(tClasses.length===2 && tClasses.every(c=>c.id&&c.code&&c.studentCount>0&&c.teachers.length>0), "teacher: the 2 classes they teach, with counts + teachers");
assert(tSubjects.length===5 && tSubjects[0].name==="Physics" && tSubjects[0].classId===tClasses[0].id, "teacher: 5 subjects in their classes, creation order (Physics first)");
await as("student");
assert((await get("/classes")).length===1 && (await get("/subjects")).length===3, "student: own class + its 3 subjects only");
e = await code(() => S.createSubject({ classId:"cls-11a", name:"Art" })); assert(e?.status===403, "student can't create a subject");
await as("teacher");
const chem = tSubjects.find(x=>x.classId==="cls-11a"&&x.name==="Chemistry");
e = await code(() => T.generateTest({ mix:[{type:"mcq",count:1,marks:1}], mode:"class" })); assert(e?.code==="SUBJECT_REQUIRED", "generate without a subject → SUBJECT_REQUIRED");
const gen = await T.generateTest({ subjectId: chem.id, mix:[{type:"mcq",count:1,marks:1}], mode:"class" });
assert(gen.subject==="Chemistry" && gen.cls==="11A" && gen.subjectId===chem.id, "generate: subject, class derive from subjectId");
const bio = await S.createSubject({ classId:"cls-11a", name:"  Biology " });
assert(bio.name==="Biology" && bio.classId==="cls-11a", "create subject trims the name");
e = await code(() => S.createSubject({ classId:"cls-11a", name:"biology" })); assert(e?.code==="DUPLICATE_SUBJECT" && e.status===409, "duplicate name in a class → 409");
e = await code(() => S.createSubject({ classId:"cls-11a", name:"  " })); assert(e?.code==="INVALID_SUBJECT" && e.status===400, "blank name → 400");
e = await code(() => S.createSubject({ classId:"nope", name:"X" })); assert(e?.status===404, "unknown class → 404");
await S.updateSubject(chem.id, { name:"Chemistry II", outline:"Atoms, bonding" });
const renamed = (await get("/tests")).filter(x=>x.subjectId===chem.id);
assert(renamed.length>=2 && renamed.every(x=>x.subject==="Chemistry II"), "rename carries through to tests");
e = await code(() => S.deleteSubject(chem.id)); assert(e?.code==="SUBJECT_IN_USE" && e.status===409, "subject with tests can't be deleted");
await S.deleteSubject(bio.id);
assert(!(await get("/subjects")).some(x=>x.id===bio.id), "empty subject deleted");
e = await code(() => client.call(`/subjects/${bio.id}/materials`, { method:"POST", body:new FormData() })); assert(e?.status===404, "materials for a missing subject → 404");

// ── admin: accounts & classes ──
const AD = await import("@/api/admin");
await as("teacher");
e = await code(() => get("/users")); assert(e?.status===403, "teacher can't list accounts");
e = await code(() => AD.createClass({ name:"Grade 9 — Section C" })); assert(e?.status===403, "teacher can't create a class");
await as("admin");
const allUsers = await get("/users");
assert(allUsers.length===3+6+11 && !allUsers.some(u=>u.role==="admin") && allUsers.every(u=>u.id&&u.email&&u.active===true), "admin: lists teachers + students, never admins");
assert(allUsers.find(u=>u.name==="Dr. R. Chen").classIds.length===2, "teacher account carries the classes they teach");
const newT = await AD.createUser({ name:" Ms.  A. Mensah ", email:"A.Mensah@westfield.edu", role:"teacher", classIds:["cls-10a"] });
assert(newT.name==="Ms. A. Mensah" && newT.email==="a.mensah@westfield.edu" && newT.classIds.join()==="cls-10a", "create teacher: trims, lowercases email, assigns class");
e = await code(() => AD.createUser({ name:"X", email:"a.mensah@westfield.edu", role:"teacher" })); assert(e?.code==="DUPLICATE_EMAIL" && e.status===409, "duplicate email → 409");
e = await code(() => AD.createUser({ name:"X", email:"nope", role:"teacher" })); assert(e?.code==="INVALID_INPUT", "bad email → 400");
e = await code(() => AD.createUser({ name:"New Kid", email:"nk@westfield.edu", role:"student" })); assert(e?.code==="INVALID_INPUT", "student needs a class");
const kid = await AD.createUser({ name:"New Kid", email:"nk@westfield.edu", role:"student", classId:"cls-10a" });
assert(kid.cls==="10A" && kid.roll==="10A-19", "create student: class code + next roll number");
const ro = await get("/classes/cls-10a/roster");
assert(ro.students.length===6 && ro.teachers.length===2 && ro.students.find(x=>x.id===kid.id).average===null, "roster: new student + teacher listed, no average yet");
const may = (await get("/classes/cls-11a/roster")).students.find(x=>x.name==="Maya Okafor");
assert(may.average>=40 && may.average<=100, "roster: average comes from submitted attempts");
await AD.updateUser(kid.id, { classId:"cls-11b" });
assert((await get("/classes/cls-11b/roster")).students.some(x=>x.id===kid.id) && (await get("/users")).find(u=>u.id===kid.id).roll==="11B-22", "move student to another class (new roll)");
await AD.updateUser(kid.id, { classId:null });
assert((await get("/users")).find(u=>u.id===kid.id).cls===null, "remove student from class");
await AD.updateUser(kid.id, { active:false });
const kidRes = await fetch(client.BASE_URL + "/tests", { headers: { Authorization: `Bearer mock.${kid.id}` } });
assert(kidRes.status===401, "deactivated account's token stops working");
e = await code(() => login({ email:"nk@westfield.edu", password:"x" })); assert(e?.code==="ACCOUNT_DISABLED" && e.status===403, "deactivated account can't sign in");
e = await code(() => AD.updateUser("u-admin", { active:false })); assert(e?.status===409, "admin accounts can't be changed here");
e = await code(() => AD.deleteUser("u-admin")); assert(e?.status===409, "admin accounts can't be removed here");
await AD.deleteUser(kid.id); await AD.deleteUser(newT.id);
assert(!(await get("/users")).some(u=>u.id===kid.id||u.id===newT.id) && !(await get("/classes")).flatMap(c=>c.teachers).some(t=>t.id===newT.id), "remove accounts (also from classes' teachers)");
const nc = await AD.createClass({ name:"Grade 9 — Section C", teacherIds:["u-osei"] });
assert(nc.code==="9C" && nc.id==="cls-9c" && nc.teachers[0].name==="Mr. D. Osei" && nc.studentCount===0, "create class: derived code, teachers assigned");
e = await code(() => AD.createClass({ name:"grade 9 — section c" })); assert(e?.code==="DUPLICATE_CLASS" && e.status===409, "duplicate class → 409");
e = await code(() => AD.createClass({ name:"Z", teacherIds:["u-maya.okafor"] })); assert(e?.code==="INVALID_INPUT", "only teachers can be assigned to a class");
const upd = await AD.updateClass(nc.id, { name:"Grade 9 — Section C (Honours)", teacherIds:["u-osei","u-park"] });
assert(upd.name.endsWith("(Honours)") && upd.teachers.length===2 && upd.code==="9C", "update class: rename + reassign teachers, code stays");
e = await code(() => AD.deleteClass("cls-11a")); assert(e?.code==="CLASS_IN_USE" && e.status===409, "class with tests can't be deleted");
await AD.deleteClass(nc.id);
assert(!(await get("/classes")).some(c=>c.id===nc.id), "empty class deleted");
await as("teacher");

// ── materials upload ──
const M = await import("@/api/materials");
const pdf = (name, size = 4000) => new File([new Uint8Array(size)], name, { type: "application/pdf" });
const img = (name) => new File([new Uint8Array(900)], name, { type: "image/png" });
const mat = await M.uploadMaterials("sub-phys-11a", [
  { file: pdf("outline.pdf"), tag: "outline" },
  { file: pdf("scanned-2022.pdf"), tag: "pastpaper", year: 2022 },
  { file: img("board.png"), tag: "outline" },
  { text: "Kinematics, forces, energy", tag: "outline" },
  { file: pdf("corrupt.pdf"), tag: "pastpaper" },
  { file: pdf("empty.pdf", 0), tag: "outline" },
]);
assert(mat.items.length===6 && mat.items.map(i=>i.index).join()==="0,1,2,3,4,5", "upload: one result per item, in order");
assert(mat.items.map(i=>i.route).join()==="direct,ocr,vision,as-is,direct,direct", "upload: route by type (direct / ocr / vision / as-is)");
assert(mat.items[1].tag==="pastpaper" && mat.items[1].year===2022 && mat.items[1].warnings.length===1, "upload: tag + year echoed, scan warns");
assert(mat.items[4].status==="failed" && /open/.test(mat.items[4].error) && mat.items[5].status==="failed" && mat.items[5].error==="The file is empty", "upload: a bad file fails alone");
assert(mat.items.filter(i=>i.status==="extracted").length===4 && mat.topics.length>0, "upload: the rest are extracted, topics returned");
assert(mat.warnings.length===0, "upload: no batch warning when every extracted past paper has a year");
const noYear = await M.uploadMaterials("sub-phys-11a", [{ file: pdf("p.pdf"), tag:"pastpaper" }]);
assert(noYear.warnings.length===1 && noYear.items[0].year===undefined, "upload: past paper without a year → batch warning");
const allBad = await M.uploadMaterials("sub-phys-11a", [{ file: pdf("corrupt.pdf"), tag:"outline" }]);
assert(allBad.topics.length===0 && allBad.items[0].status==="failed", "upload: nothing readable → no topics");
e = await code(() => M.uploadMaterials("sub-phys-11a", [{ file: pdf("a.pdf"), tag:"notes" }])); assert(e?.code==="INVALID_TAG" && e.status===400, "upload: unknown tag → 400");
{ const form = new FormData(); form.append("manifest", JSON.stringify([{ source:"text", name:"Pasted text", tag:"outline", year:2020 }])); form.append("pastedText", "x");
  e = await code(() => client.call("/subjects/sub-phys-11a/materials", { method:"POST", body:form })); assert(e?.code==="INVALID_YEAR", "upload: a year on an outline is rejected by the server"); }
assert(!M.buildUploadForm([{ text:"x", tag:"outline", year:2020 }]).get("manifest").includes("year"), "client never sends a year for an outline");
e = await code(() => M.uploadMaterials("sub-phys-11a", [{ file: pdf("a.pdf"), tag:"pastpaper", year:1850 }])); assert(e?.code==="INVALID_YEAR", "upload: implausible year → 400");
e = await code(() => M.uploadMaterials("sub-phys-11a", [{ file: new File([new Uint8Array(10)], "a.exe", { type:"application/x-msdownload" }), tag:"outline" }])); assert(e?.code==="UNSUPPORTED_TYPE" && e.status===415, "upload: unsupported type → 415");
e = await code(() => M.uploadMaterials("sub-phys-11a", Array.from({length:21}, () => ({ text:"x", tag:"outline" })))); assert(e?.code==="TOO_MANY_ITEMS", "upload: more than 20 items → 400");
e = await code(() => M.uploadMaterials("sub-phys-11a", [])); assert(e?.code==="INVALID_UPLOAD", "upload: nothing to upload → 400");
e = await code(() => client.call("/subjects/sub-phys-11a/materials", { method:"POST", body:new FormData() })); assert(e?.code==="INVALID_UPLOAD", "upload: no manifest → 400");

// ── materials review: stored text, corrections ──
const stored = await get("/subjects/sub-phys-11a/materials");
assert(stored.length===5, "stored: only successfully read items are kept (4 + the past paper without a year)");
const extd = mat.items.filter(i=>i.status==="extracted");
assert(extd.every(i=>i.id && ["high","med","low"].includes(i.quality)), "extracted items carry an id + quality");
assert(mat.items[1].quality==="low" && mat.items[2].quality==="med" && mat.items[0].quality==="high", "quality follows the route (ocr low, vision med, direct high)");
const outline0 = stored.find(x=>x.id===extd[0].id);
assert(outline0.text.length===outline0.chars && outline0.edited===false && outline0.tag==="outline", "list: full text, chars, not edited");
assert(stored.find(x=>x.id===extd[3].id).text==="Kinematics, forces, energy", "pasted text is stored exactly as sent");
const edited = await M.updateMaterial(outline0.id, outline0.text + "\nUnit 4 · Waves");
assert(edited.edited===true && edited.text.endsWith("Waves") && edited.chars===edited.text.length, "PUT: corrected text saved, flagged edited");
assert((await get("/subjects/sub-phys-11a/materials")).find(x=>x.id===outline0.id).text.endsWith("Waves"), "PUT persists");
e = await code(() => M.updateMaterial(outline0.id, "   ")); assert(e?.code==="INVALID_TEXT" && e.status===400, "PUT: empty text → 400");
e = await code(() => M.updateMaterial(outline0.id, "x".repeat(200_001))); assert(e?.code==="INVALID_TEXT" && e.status===413, "PUT: over 200k chars → 413");
e = await code(() => M.updateMaterial("nope", "x")); assert(e?.status===404, "PUT: unknown material → 404");
const back = await M.reextractMaterial(outline0.id);
assert(back.edited===false && !back.text.endsWith("Waves"), "re-extract restores the original reading");
await code(() => M.uploadMaterials("sub-phys-11a", [{ file: pdf("keep-me.pdf"), tag:"outline" }, { file: pdf("b.pdf"), tag:"bogus" }]));
assert((await get("/subjects/sub-phys-11a/materials")).length===5, "a rejected upload stores nothing");
await as("student");
e = await code(() => get("/subjects/sub-phys-11a/materials")); assert(e?.status===403, "student can't list materials");
e = await code(() => M.updateMaterial(outline0.id, "x")); assert(e?.status===403, "student can't edit materials");
await as("teacher");

// ── materials library: delete, outline ──
const lib = await get("/subjects/sub-phys-11a/materials");
const victim = lib[lib.length-1];
await as("student"); e = await code(() => M.deleteMaterial(victim.id)); assert(e?.status===403, "student can't delete materials");
await as("teacher");
await M.deleteMaterial(victim.id);
assert((await get("/subjects/sub-phys-11a/materials")).length===lib.length-1 && !(await get("/subjects/sub-phys-11a/materials")).some(x=>x.id===victim.id), "delete removes the item from the library");
e = await code(() => M.deleteMaterial(victim.id)); assert(e?.status===404, "deleting it again → 404");
e = await code(() => M.reextractMaterial(victim.id)); assert(e?.status===404, "re-extract a deleted item → 404");
const withOutline = await S.updateSubject("sub-phys-11a", { outline: "Unit 1 · Mechanics" });
assert(withOutline.outline==="Unit 1 · Mechanics" && (await get("/subjects")).find(x=>x.id==="sub-phys-11a").outline==="Unit 1 · Mechanics", "subject outline saves and lists");
e = await code(() => S.updateSubject("sub-phys-11a", { outline: "x".repeat(20_001) })); assert(e?.code==="INVALID_SUBJECT", "outline over 20,000 chars → 400");

// ── clusters + question split ──
const chemId = "sub-chem-11a";
const empty = await get(`/subjects/${chemId}/clusters`);
assert(empty.papers.length===0 && empty.clusters.length===0 && empty.questionCount===0 && empty.threshold===0.3, "clusters: a subject with no past papers → empty, not an error");
const up5 = await M.uploadMaterials(chemId, [2020,2021,2022,2023,2024].map(y => ({ file: pdf(`paper_${y}.pdf`), tag:"pastpaper", year:y })).concat([{ file: pdf("syllabus.pdf"), tag:"outline" }]));
const cl = await get(`/subjects/${chemId}/clusters`);
assert(cl.papers.length===5 && cl.papers.every(p=>p.year && p.questionCount>=3), "clusters: only past papers count (the outline isn't one)");
assert(cl.questionCount===cl.papers.reduce((n,p)=>n+p.questionCount,0) && cl.clusters.reduce((n,c)=>n+c.count,0)===cl.questionCount, "clusters: every question lands in exactly one cluster");
assert(cl.clusters[0].paperCount===5 && /Newton/.test(cl.clusters[0].label) && cl.clusters.every((c,i,a)=>!i||a[i-1].paperCount>=c.paperCount), "clusters: largest first (appears in most papers)");
assert(cl.clusters[0].years.join()==="2020,2021,2022,2023,2024" && cl.clusters[0].questions.every(q=>q.id&&q.text&&q.paperName&&q.year), "cluster detail: years + every variant with its paper");
const strict = await get(`/subjects/${chemId}/clusters?threshold=0.6`);
assert(strict.clusters.length>cl.clusters.length && strict.threshold===0.6, "stricter grouping → more, smaller clusters");
e = await code(() => get(`/subjects/${chemId}/clusters?threshold=2`)); assert(e?.code==="INVALID_THRESHOLD" && e.status===400, "bad threshold → 400");
e = await code(() => get("/subjects/nope/clusters")); assert(e?.status===404, "clusters: unknown subject → 404");

const paper = cl.papers.find(p=>p.year===2020);
const pq = await get(`/materials/${paper.id}/questions`);
assert(pq.questions.length===paper.questionCount && pq.name==="paper_2020.pdf", "paper questions: the current split");
const merged = [`${pq.questions[0]} ${pq.questions[1]}`, ...pq.questions.slice(2)];
const saved = await M.saveQuestions(paper.id, merged);
assert(saved.questions.length===pq.questions.length-1, "fix split: join two questions");
const cl2 = await get(`/subjects/${chemId}/clusters`);
assert(cl2.questionCount===cl.questionCount-1 && cl2.papers.find(p=>p.id===paper.id).questionCount===merged.length, "clusters update after the split is fixed");
const cut = await M.saveQuestions(paper.id, [...merged, "Extra question about waves"]);
assert(cut.questions.length===merged.length+1 && (await get(`/subjects/${chemId}/clusters`)).questionCount===cl.questionCount, "fix split: add a question back");
for (const bad of [[], [""], ["ok", "   "], Array.from({length:201}, (_, i)=>`q${i}`), ["x".repeat(2001)]]) {
  e = await code(() => M.saveQuestions(paper.id, bad)); assert(e?.code==="INVALID_QUESTIONS" && e.status===400, `invalid split rejected (${bad.length} items)`);
}
const outlineId = up5.items.find(i=>i.tag==="outline").id;
e = await code(() => get(`/materials/${outlineId}/questions`)); assert(e?.code==="NOT_A_PAST_PAPER" && e.status===409, "an outline has no question split → 409");
e = await code(() => M.saveQuestions(outlineId, ["x"])); assert(e?.code==="NOT_A_PAST_PAPER", "can't save a split for an outline");
await M.updateMaterial(paper.id, "1. Only one question left\n2. And another one");
assert((await get(`/materials/${paper.id}/questions`)).questions.length===2, "editing a paper's text re-splits it");
await M.reextractMaterial(paper.id);
assert((await get(`/materials/${paper.id}/questions`)).questions.length===pq.questions.length, "re-reading the original restores the split");
await M.deleteMaterial(paper.id);
assert((await get(`/subjects/${chemId}/clusters`)).papers.length===4, "deleting a paper removes it from the clusters");
await as("student");
e = await code(() => get(`/subjects/${chemId}/clusters`)); assert(e?.status===403, "student can't read clusters");
e = await code(() => get(`/materials/${paper.id}/questions`)); assert(e?.status===403, "student can't read a split");
await as("teacher");

// ── web research + thin topics ──
const rules = (extra = {}) => ({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:7,marks:1}], mode:"class", focusTopics:["Wave Optics","Kinematics","Newton's Laws of Motion"], ...extra });
const topicsRes = await get("/subjects/sub-phys-11a/topics");
assert(topicsRes.length>0 && topicsRes.every(t=>t.name && typeof t.thin==="boolean" && t.passages>=0) && topicsRes.some(t=>t.thin) && topicsRes.some(t=>!t.thin), "topics: each carries thin + passages; some thin, some not");
assert((await get("/subjects/sub-phys-12x-none/topics").catch(x=>x.status))===404, "topics: unknown subject → 404");
assert((await get("/subjects/sub-math-11a/topics")).length===0, "topics: nothing uploaded → empty list");
const noWeb = await T.generateTest(rules());
assert(noWeb.research.enabled===false && noWeb.research.webQuestions===0 && noWeb.research.thinTopics.includes("Wave Optics"), "no web research: thin topics reported, no web sources");
assert(noWeb.questionSet.every(q=>!q.sources.some(s=>s.kind==="web")) && noWeb.questionSet.some(q=>q.sources.some(s=>s.kind==="material")), "no web research: only the teacher's own material is cited");
const withWeb = await T.generateTest(rules({ webResearch:true }));
const webQs = withWeb.questionSet.filter(q=>q.sources.some(s=>s.kind==="web"));
assert(withWeb.research.enabled===true && webQs.length===withWeb.research.webQuestions && webQs.length>0 && webQs.every(q=>q.topic==="Wave Optics"), "web research: only thin-topic questions get a web source");
const ws = webQs[0].sources.find(s=>s.kind==="web");
assert(ws.label && ws.snippet && ws.url.startsWith("https://") && ws.retrievedAt>0 && webQs[0].sources.some(s=>s.kind==="material"), "web source: labelled, snippet, url, retrieved time — alongside (not instead of) the material source");
const personal = await T.generateTest(rules({ mode:"personal", webResearch:true }));
assert(personal.variants.every(v=>v.questions.every(q=>Array.isArray(q.sources))) && personal.research.enabled, "personalized variants carry sources too");
e = await code(() => T.generateTest(rules({ webResearch:"yes" }))); assert(e?.code==="INVALID_INPUT" && e.status===400, "webResearch must be a boolean");
const regenW = await T.regenerateTest(withWeb.id);
assert(regenW.research.enabled===true && regenW.questionSet.some(q=>q.sources.some(s=>s.kind==="web")), "regenerating keeps web research on");
await T.publishTest(withWeb.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ release:"immediately" } });
await as("student");
const sOpen = await get("/tests");
const st = sOpen.find(x=>x.id===withWeb.id);
assert(st && !st.questionSet && !st.variants && !st.research, "students never receive a test's questions or research info");
await as("teacher");

// ── question bank ──
const B = await import("@/api/bank");
const bank0 = await get("/subjects/sub-phys-11a/bank");
assert(bank0.length>=10 && bank0.filter(b=>b.id.startsWith("bq-q")).length===10 && bank0.every(b=>b.id&&b.topic&&b.text&&b.source&&b.used>=0), "bank: the 10 seeded questions are there (plus anything earlier tests published)");
assert((await get("/subjects/sub-chem-11a/bank")).length===0, "bank: other subjects start empty");
assert((await get("/subjects/sub-phys-11a/bank?topic=Kinematics")).every(b=>b.topic==="Kinematics") && (await get("/subjects/sub-phys-11a/bank?source=generated")).every(b=>b.source==="generated"), "bank: topic and source filters");
const mq = await B.createBankQuestion("sub-phys-11a", { type:"mcq", topic:"Waves", marks:2, text:"  What is the unit of frequency?  ", options:["Hz","m","s","W"], correctIndex:0 });
assert(mq.source==="manual" && mq.used===0 && mq.lastUsed===null && mq.text==="What is the unit of frequency?", "create: manual source, trimmed, unused");
for (const [bad, why] of [[{type:"mcq",topic:"W",marks:1,text:"q",options:["a","b"],correctIndex:null},"no correct option"],[{type:"mcq",topic:"W",marks:1,text:"q",options:["a",""],correctIndex:0},"empty option"],[{type:"short",topic:"",marks:1,text:"q"},"no topic"],[{type:"short",topic:"W",marks:0,text:"q"},"zero marks"],[{type:"short",topic:"W",marks:1,text:"  "},"empty text"],[{type:"essay",topic:"W",marks:1,text:"q"},"unknown type"]]) {
  e = await code(() => B.createBankQuestion("sub-phys-11a", bad)); assert(e?.code==="INVALID_QUESTION" && e.status===400, `create rejects: ${why}`);
}
const up = await B.updateBankQuestion(mq.id, { ...mq, marks:3, text:"Which unit measures frequency?" });
assert(up.marks===3 && up.text.startsWith("Which") && up.source==="manual", "update: content replaced, source kept");
await as("student"); e = await code(() => get("/subjects/sub-phys-11a/bank")); assert(e?.status===403, "student can't read the bank");
e = await code(() => B.deleteBankQuestion(mq.id)); assert(e?.status===403, "student can't delete from the bank"); await as("teacher");
await B.deleteBankQuestion(mq.id);
assert(!(await get("/subjects/sub-phys-11a/bank")).some(b=>b.id===mq.id), "delete removes it");
e = await code(() => B.updateBankQuestion(mq.id, mq)); assert(e?.status===404, "update a deleted question → 404");

// add to draft: picked bank questions lead the draft, generated ones fill the rest
const pickIds = ["bq-q1","bq-q2"]; // an mcq and a short
const withBank = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:3,marks:1},{type:"short",count:2,marks:2}], mode:"class", bankQuestionIds: pickIds });
const qs = withBank.questionSet;
assert(qs.length===5 && qs[0].bankId==="bq-q1" && qs[1].bankId==="bq-q2" && qs.slice(2).every(q=>!q.bankId), "bank picks come first; mix is reduced by what they cover (5 total)");
assert(qs[0].sources[0].kind==="bank" && qs[0].id!=="bq-q1" && qs[0].options.length===4 && qs[0].correctIndex===1, "bank question copied (new id, answer key kept, labelled as bank)");
assert(qs.filter(q=>q.type==="mcq").length===3 && qs.filter(q=>q.type==="short").length===2, "per-type counts still match the mix");
const onlyBank = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:0,marks:1}], mode:"class", bankQuestionIds:["bq-q1"] });
assert(onlyBank.questionSet.length===1, "a draft made only of bank questions is allowed");
e = await code(() => T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:1,marks:1}], mode:"class", bankQuestionIds:["nope"] })); assert(e?.code==="INVALID_BANK_IDS", "unknown bank id → 400");
e = await code(() => T.generateTest({ subjectId:"sub-chem-11a", mix:[{type:"mcq",count:1,marks:1}], mode:"class", bankQuestionIds:["bq-q1"] })); assert(e?.code==="INVALID_BANK_IDS", "another subject's bank question → 400");
const pBank = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:2,marks:1}], mode:"personal", bankQuestionIds:["bq-q1"] });
assert(pBank.variants.every(v=>v.questions[0].bankId==="bq-q1"), "personalized: every variant gets the bank question");
const regenB = await T.regenerateTest(withBank.id);
assert(regenB.questionSet[0].bankId==="bq-q1" && regenB.questionSet.length===5, "regenerating keeps the bank picks");

// publish saves to the bank
const before = await get("/subjects/sub-phys-11a/bank");
const used1 = before.find(b=>b.id==="bq-q1").used;
const draft = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"short",count:2,marks:2}], mode:"class", bankQuestionIds:["bq-q1"] });
const pub = await T.publishTest(draft.id, {});
const distinct = new Set(draft.questionSet.map(q=>q.bankId ?? q.text.trim().toLowerCase())).size;
assert(pub.bankSummary.reused>=1 && pub.bankSummary.added+pub.bankSummary.reused===distinct, "publish: summary accounts for every distinct question (reused + newly saved)");
const after = await get("/subjects/sub-phys-11a/bank");
assert(after.length===before.length+pub.bankSummary.added && after.find(b=>b.id==="bq-q1").used===used1+1 && after.find(b=>b.id==="bq-q1").lastUsed>Date.now()-60_000, "publish: new questions added as generated, reused one counted");
assert(after.filter(b=>b.source==="generated").length>=before.filter(b=>b.source==="generated").length+pub.bankSummary.added, "publish: new ones are source 'generated'");
const draft2 = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"short",count:1,marks:2}], mode:"class" });
const reusedText = after.find(b=>b.id==="bq-q2").text;
await T.saveTest(draft2.id, { questionSet: draft2.questionSet.map(q=>({ ...q, text: "  "+reusedText.toUpperCase()+" " })) });
const pub2 = await T.publishTest(draft2.id, {});
assert(pub2.bankSummary.reused===1 && pub2.bankSummary.added===0, "publish: a question with the same text as a bank one counts as a reuse, not a duplicate");

// ── personalized generation progress ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const gp = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:2,marks:1}], mode:"personal" });
assert(gp.generation.status==="running" && gp.generation.total===6 && gp.generation.done<6 && gp.variants.length===gp.generation.done, "personalized: starts running, only finished variants are returned");
assert(gp.generation.currentStudent && gp.generation.etaSeconds>=1, "personalized: says who is being written and how long is left");
e = await code(() => T.saveTest(gp.id, { variants: gp.variants })); assert(e?.code==="GENERATION_IN_PROGRESS" && e.status===409, "can't edit variants while generating");
assert((await T.saveTest(gp.id, { title:"Renamed while generating" })).title==="Renamed while generating", "a rename is still allowed");
e = await code(() => T.publishTest(gp.id, {})); assert(e?.code==="GENERATION_IN_PROGRESS", "can't publish while generating");
e = await code(() => T.regenerateTest(gp.id)); assert(e?.code==="GENERATION_IN_PROGRESS", "can't regenerate while generating");
const p1 = await get(`/tests/${gp.id}/generation`);
await sleep(1500);
const p2 = await get(`/tests/${gp.id}/generation`);
assert(p1.status==="running" && p2.done>p1.done, "progress advances over time");
assert((await get("/tests")).find(x=>x.id===gp.id).variants.length===p2.done || (await get("/tests")).find(x=>x.id===gp.id).generation.status==="done", "the test list reflects the same partial set");
let pf; for (let i=0;i<20;i++){ pf = await get(`/tests/${gp.id}/generation`); if (pf.status==="done") break; await sleep(500); }
assert(pf.status==="done" && pf.done===6 && pf.etaSeconds===undefined, "generation finishes");
const fullP = (await get("/tests")).find(x=>x.id===gp.id);
assert(fullP.variants.length===6 && fullP.generation.status==="done" && fullP.variants.every(v=>v.questions.length===2), "all 6 variants present once done");
await T.saveTest(gp.id, { variants: fullP.variants });
const pubP = await T.publishTest(gp.id, {});
assert(pubP.status!=="draft", "publishing works once generation is done");
const cls0 = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:2,marks:1}], mode:"class" });
assert(cls0.generation===undefined && (await get(`/tests/${cls0.id}/generation`)).status==="done", "class tests have no generation to wait for");
const rg = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:1,marks:1}], mode:"personal" });
for (let i=0;i<20;i++){ if ((await get(`/tests/${rg.id}/generation`)).status==="done") break; await sleep(500); }
const rg2 = await T.regenerateTest(rg.id);
assert(rg2.generation.status==="running" && rg2.generation.done<6, "regenerating a personalized draft starts a new run");
for (let i=0;i<20;i++){ if ((await get(`/tests/${rg.id}/generation`)).status==="done") break; await sleep(500); }
await as("student");
e = await code(() => get(`/tests/${gp.id}/generation`)); assert(e?.status===403, "student can't read generation progress");
assert(!(await get("/tests")).some(x=>x.generation), "students never see generation info");
await as("teacher");

// ── anti-cheat: the page watcher (fake document/window) ──
const AC = await import("@/lib/antiCheat");
const fakeEnv = (over = {}) => {
  const doc = Object.assign(new EventTarget(), { hidden:false, fullscreenElement:null, hasFocus:()=>true }, over.doc);
  const win = Object.assign(new EventTarget(), over.win);
  let t = 1_000_000; const clock = () => t;
  const seen = []; const fs = [];
  const watcher = AC.watchTestPage({ doc, win, report:(x)=>seen.push(x), onFullscreen:(b)=>fs.push(b), now:clock, ...over.opts });
  const fire = (target, name, props = {}) => { const ev = new Event(name, { cancelable:true }); Object.assign(ev, props); target.dispatchEvent(ev); return ev; };
  return { doc, win, seen, fs, stop: watcher.stop, pause: watcher.pause, fire, tick:(ms)=>{ t += ms; } };
};
{
  const env = fakeEnv({ opts:{ requireFullscreen:true, blockCopyPaste:true } });
  assert(env.seen.join()==="fullscreen-denied" && env.fs[0]===false, "starting outside fullscreen when it's required → fullscreen-denied");
  env.doc.fullscreenElement = {}; env.fire(env.doc, "fullscreenchange"); assert(env.fs.at(-1)===true && env.seen.length===1, "entering fullscreen isn't a flag");
  env.doc.fullscreenElement = null; env.fire(env.doc, "fullscreenchange"); assert(env.seen.at(-1)==="fullscreen-exit" && env.fs.at(-1)===false, "leaving fullscreen → fullscreen-exit");
  env.doc.hidden = true; env.fire(env.doc, "visibilitychange"); assert(env.seen.at(-1)==="tab-switch", "tab hidden → tab-switch");
  env.doc.hidden = false; env.fire(env.doc, "visibilitychange"); assert(env.seen.filter(x=>x==="tab-switch").length===1, "coming back isn't a flag");
  for (const [ev, type] of [["contextmenu","right-click"],["copy","copy"],["cut","cut"],["paste","paste"]]) { const e = env.fire(env.doc, ev); assert(e.defaultPrevented && env.seen.at(-1)===type, `${ev} is cancelled and reported as ${type}`); }
  const bu = env.fire(env.win, "beforeunload"); assert(bu.defaultPrevented && env.seen.at(-1)==="page-leave-attempt", "reload/close → leave prompt + page-leave-attempt");
  const n = env.seen.length; env.fire(env.doc, "paste"); assert(env.seen.length===n, "the same event twice within a moment is reported once");
  env.tick(1000); env.fire(env.doc, "paste"); assert(env.seen.length===n+1, "…and again after the throttle window");
  env.stop(); const m = env.seen.length; env.fire(env.doc, "copy"); env.fire(env.win, "beforeunload"); assert(env.seen.length===m, "stopping removes every listener");
}
{
  const env = fakeEnv({ opts:{ requireFullscreen:false, blockCopyPaste:false } });
  assert(env.seen.length===0, "fullscreen not required → no fullscreen-denied");
  env.doc.fullscreenElement = {}; env.fire(env.doc, "fullscreenchange"); env.doc.fullscreenElement = null; env.fire(env.doc, "fullscreenchange");
  assert(env.seen.length===0, "fullscreen not required → leaving it isn't flagged");
  const e = env.fire(env.doc, "paste"); assert(!e.defaultPrevented && env.seen.length===0, "copy/paste allowed when blocking is off");
  env.doc.hidden = true; env.fire(env.doc, "visibilitychange"); assert(env.seen.join()==="tab-switch", "tab switches are always recorded");
  env.stop();
}
{
  const env = fakeEnv({ doc:{ hasFocus:()=>false } }); // after a real blur the page no longer has focus
  env.fire(env.win, "blur"); await sleep(250);
  assert(env.seen.join()==="window-blur", "focus lost while the tab is visible → window-blur");
  env.stop();
  const env2 = fakeEnv({ doc:{ hasFocus:()=>false } });
  env2.fire(env2.win, "blur"); env2.doc.hidden = true; env2.fire(env2.doc, "visibilitychange"); await sleep(250);
  assert(env2.seen.join()==="tab-switch", "a tab switch isn't double-counted as a window-blur");
  env2.stop();
  const env3 = fakeEnv({ doc:{ hasFocus:()=>false } });
  env3.fire(env3.win, "blur"); env3.fire(env3.win, "focus"); await sleep(250);
  assert(env3.seen.length===0, "a blur that comes straight back isn't flagged");
  env3.stop();
}
assert(Object.keys(AC.FLAG_TYPES).length===10 && Object.values(AC.FLAG_TYPES).every(f=>f.label && ["low","medium","high"].includes(f.severity)) && AC.flagLabel("copy")==="Tried to copy" && AC.flagLabel("zzz")==="zzz", "flag types are labelled");


// ── anti-cheat: F11 / browser fullscreen, StrictMode, finishing ──
{
  const screenBox = { width:1920, height:1080 };
  const windowed = { outerWidth:1500, outerHeight:900, screen:screenBox };
  const f11 = { outerWidth:1920, outerHeight:1080 };
  assert(AC.fullscreenState({ fullscreenElement:{} }, windowed).kind==="api", "fullscreenState: Fullscreen API → kind api");
  assert(AC.fullscreenState({ fullscreenElement:null }, { ...windowed, ...f11 }).kind==="browser", "fullscreenState: window covers the screen (F11) → kind browser");
  assert(AC.fullscreenState({ fullscreenElement:null }, { ...windowed, matchMedia:()=>({ matches:true }) }).kind==="browser", "fullscreenState: display-mode fullscreen media query → browser");
  assert(AC.fullscreenState({ fullscreenElement:null }, windowed).active===false, "fullscreenState: an ordinary or maximised window is not fullscreen");
  assert(AC.fullscreenState({ fullscreenElement:null }, { ...windowed, outerWidth:1920, outerHeight:1040 }).active===false, "fullscreenState: maximised with a taskbar (shorter than the screen) is not fullscreen");
  assert(AC.fullscreenState({ fullscreenElement:null }, { ...windowed, outerWidth:1919, outerHeight:1079 }).active===true, "fullscreenState: 1px of rounding is tolerated");
  assert(AC.fullscreenState({ fullscreenElement:null }, {}).active===false, "fullscreenState: no screen info → not fullscreen");

  // The reported bug: F11 was invisible to the app.
  const env = fakeEnv({ win:{ ...windowed }, opts:{ requireFullscreen:true } });
  assert(env.seen.join()==="fullscreen-denied" && env.fs[0]===false, "F11 scenario: starts windowed → denied");
  Object.assign(env.win, f11); env.fire(env.win, "resize"); await sleep(300);
  assert(env.fs.at(-1)===true && env.seen.join()==="fullscreen-denied", "pressing F11 is detected (no fullscreenchange needed) and isn't a flag");
  Object.assign(env.win, windowed); env.fire(env.win, "resize"); await sleep(300);
  assert(env.fs.at(-1)===false && env.seen.at(-1)==="fullscreen-exit", "leaving with F11 → fullscreen-exit");
  env.tick(1000);
  Object.assign(env.win, f11); env.fire(env.win, "resize"); await sleep(300);
  assert(env.fs.at(-1)===true && env.seen.filter(x=>x==="fullscreen-exit").length===1, "going back in with F11 → detected, not flagged");
  for (let i=0;i<5;i++) env.fire(env.win, "resize"); await sleep(300);
  assert(env.seen.filter(x=>x==="fullscreen-exit").length===1 && env.fs.at(-1)===true, "resize noise while still fullscreen isn't an exit");
  env.stop();
}
{ // API fullscreen followed by F11 (which leaves it): one exit
  const win = { outerWidth:1500, outerHeight:900, screen:{ width:1920, height:1080 } };
  const env = fakeEnv({ win, opts:{ requireFullscreen:true }, doc:{ fullscreenElement:{} } });
  assert(env.seen.length===0 && env.fs[0]===true, "already fullscreen via the API at the start → fine");
  env.doc.fullscreenElement = null; env.fire(env.doc, "fullscreenchange");
  assert(env.seen.join()==="fullscreen-exit", "leaving API fullscreen → exit (and again via resize isn't double counted)");
  env.fire(env.win, "resize"); await sleep(300); assert(env.seen.length===1, "…the resize that follows adds nothing");
  env.stop();
}
{ // display-mode media query changes count too
  const media = Object.assign(new EventTarget(), { matches:true });
  const env = fakeEnv({ win:{ outerWidth:1500, outerHeight:900, screen:{ width:1920, height:1080 }, matchMedia:()=>media }, opts:{ requireFullscreen:true } });
  assert(env.fs[0]===true && env.seen.length===0, "media query says fullscreen → fullscreen");
  media.matches = false; media.dispatchEvent(new Event("change"));
  assert(env.seen.join()==="fullscreen-exit", "media query change → exit");
  env.stop();
}
{ // React StrictMode starts, stops and restarts the watcher within a moment: report once
  const throttle = {}; const seen = [];
  const doc = Object.assign(new EventTarget(), { hidden:false, fullscreenElement:null, hasFocus:()=>true }); const win = new EventTarget();
  const start = () => AC.watchTestPage({ doc, win, report:(x)=>seen.push(x), requireFullscreen:true, throttle });
  const a = start(); a.stop(); const b = start();
  assert(seen.join()==="fullscreen-denied", "a StrictMode restart doesn't report fullscreen-denied twice");
  b.stop();
  const doc2 = Object.assign(new EventTarget(), { hidden:false, fullscreenElement:null, hasFocus:()=>true });
  const seen2 = []; const c = AC.watchTestPage({ doc:doc2, win:new EventTarget(), report:(x)=>seen2.push(x), requireFullscreen:true }); c.stop();
  const d = AC.watchTestPage({ doc:doc2, win:new EventTarget(), report:(x)=>seen2.push(x), requireFullscreen:true });
  assert(seen2.length===2, "(without a shared throttle it would — which is why the hook shares one)"); d.stop();
}
{ // finishing: leaving fullscreen after submit must not be reported
  const env = fakeEnv({ opts:{ requireFullscreen:true, blockCopyPaste:true }, doc:{ fullscreenElement:{} } });
  env.pause();
  env.doc.fullscreenElement = null; env.fire(env.doc, "fullscreenchange");
  const e2 = env.fire(env.doc, "copy"); const bu = env.fire(env.win, "beforeunload"); env.doc.hidden = true; env.fire(env.doc, "visibilitychange");
  assert(env.seen.length===0 && !e2.defaultPrevented && !bu.defaultPrevented, "pause(): nothing is reported or blocked after the test is handed in");
  env.stop();
  assert((await AC.leaveFullscreen())===undefined && AC.isFullscreen()===false, "leaveFullscreen / isFullscreen are safe outside a browser");
}


// ── anti-cheat: developer-tool shortcuts ──
{
  const k = (code, mods = {}) => ({ code, ctrlKey:false, shiftKey:false, altKey:false, metaKey:false, ...mods });
  const yes = [["F12",{}],["KeyI",{ctrlKey:true,shiftKey:true}],["KeyJ",{ctrlKey:true,shiftKey:true}],["KeyC",{ctrlKey:true,shiftKey:true}],["KeyK",{ctrlKey:true,shiftKey:true}],["KeyI",{metaKey:true,altKey:true}],["KeyJ",{metaKey:true,altKey:true}],["KeyC",{metaKey:true,shiftKey:true}],["KeyU",{ctrlKey:true}],["KeyU",{metaKey:true,altKey:true}]];
  const no = [["KeyI",{}],["KeyI",{ctrlKey:true}],["KeyC",{ctrlKey:true}],["KeyV",{ctrlKey:true}],["KeyU",{}],["KeyU",{ctrlKey:true,shiftKey:true}],["F11",{}],["Enter",{}],["KeyJ",{shiftKey:true}]];
  assert(yes.every(([c,m]) => AC.isDevToolsShortcut(k(c,m))), "isDevToolsShortcut: F12, Ctrl+Shift+I/J/C/K, Cmd+Opt+I/J/U, Cmd+Shift+C, Ctrl+U");
  assert(no.every(([c,m]) => !AC.isDevToolsShortcut(k(c,m))), "isDevToolsShortcut: ordinary typing, copy, F11 and Ctrl+Shift+U are not");
  const env = fakeEnv();
  const ev = env.fire(env.doc, "keydown", k("F12"));
  assert(env.seen.join()==="devtools-shortcut" && !ev.defaultPrevented, "F12 is recorded but NOT blocked");
  env.tick(1000); env.fire(env.doc, "keydown", k("KeyI",{ctrlKey:true,shiftKey:true})); env.fire(env.doc, "keydown", k("KeyV",{ctrlKey:true}));
  assert(env.seen.length===2, "other keys aren't recorded");
  env.fire(env.doc, "keydown", k("KeyJ",{ctrlKey:true,shiftKey:true})); assert(env.seen.length===2, "a burst of shortcuts is throttled");
  env.pause(); env.tick(1000); env.fire(env.doc, "keydown", k("F12")); assert(env.seen.length===2, "paused → not recorded");
  env.stop();
  const noBlock = fakeEnv({ opts:{ blockCopyPaste:false, requireFullscreen:false } });
  noBlock.fire(noBlock.doc, "keydown", k("F12")); assert(noBlock.seen.join()==="devtools-shortcut", "recorded even when copy/paste blocking is off (always on)");
  noBlock.stop();
}

// ── 7.2: per-test settings ──
{
  const TS = await import("@/lib/testSettings");
  assert(TS.DEFAULT_SETTINGS.requireFullscreen===true && TS.DEFAULT_SETTINGS.blockCopyPaste===true, "defaults: fullscreen required, copy/paste blocked");
  assert(TS.integrityRules({}).length===3 && /fullscreen/i.test(TS.integrityRules({})[0]) && /copying/i.test(TS.integrityRules({})[1]), "intro rules: all on → three rules");
  const off = TS.integrityRules({ settings:{ requireFullscreen:false, blockCopyPaste:false } });
  assert(off.length===1 && /developer-tool/.test(off[0]), "intro rules: switches off → only the always-on recording notice");
  assert(TS.integrityRules({ settings:{ requireFullscreen:false } }).length===2 && !TS.integrityRules({ settings:{ requireFullscreen:false } }).some(r=>/fullscreen/i.test(r)), "intro rules: each switch controls its own line");
  const mk = async () => T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:1,marks:1}], mode:"class" });
  for (const [bad, why] of [[{ requireFullscreen:"yes" },"non-boolean"],[{ shuffleAll:true },"unknown key"],[{ shuffleQuestions:"yes" },"non-boolean shuffle"],[{ release:"never" },"bad release"],[[],"array"],["x","string"]]) {
    const d = await mk(); const bankBefore = (await get("/subjects/sub-phys-11a/bank")).length;
    e = await code(() => T.publishTest(d.id, { settings: bad })); assert(e?.code==="INVALID_SETTINGS" && e.status===400, `publish rejects settings: ${why}`);
    assert((await get("/subjects/sub-phys-11a/bank")).length===bankBefore && (await get("/tests")).find(x=>x.id===d.id).status==="draft", `…and changes nothing (${why})`);
  }
  const dOff = await mk();
  const pOff = await T.publishTest(dOff.id, { settings:{ requireFullscreen:false, blockCopyPaste:false, allowBack:false } });
  assert(pOff.settings.requireFullscreen===false && pOff.settings.blockCopyPaste===false && pOff.settings.allowBack===false && pOff.settings.aiGrading===true, "published settings are stored; unspecified ones keep their defaults");
  await as("student");
  const seen = (await get("/tests")).find(x=>x.id===dOff.id);
  assert(seen.settings.requireFullscreen===false && seen.settings.blockCopyPaste===false, "students receive the switches (so the page can obey them)");
  await as("teacher");
  const dOn = await mk(); const pOn = await T.publishTest(dOn.id, {});
  assert(pOn.settings.requireFullscreen===true && pOn.settings.blockCopyPaste===true, "no settings sent → the defaults (both on)");
}

// ── anti-cheat: flags on the server ──
const acTest = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:2,marks:1}], mode:"class" });
await T.publishTest(acTest.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3 });
await as("student");
const AT = await import("@/api/attempts");
await AT.startAttempt(acTest.id);
for (const type of Object.keys(AC.FLAG_TYPES)) await AT.logFlag(acTest.id, type);
e = await code(() => AT.logFlag(acTest.id, "rage-quit")); assert(e?.code==="INVALID_FLAG" && e.status===400, "unknown flag type → 400");
e = await code(() => AT.logFlag(acTest.id, undefined)); assert(e?.code==="INVALID_FLAG", "missing flag type → 400");
const acMine = (await get("/attempts")).find(a=>a.testId===acTest.id);
assert(acMine.flags.length===10 && acMine.flags.every(f=>f.at>0) && acMine.flags.map(f=>f.type).join()===Object.keys(AC.FLAG_TYPES).join(), "all ten flag types are stored in order with timestamps");
await as("teacher");
const acRoster = await get(`/tests/${acTest.id}/attempts`);
assert(acRoster.find(r=>r.attempt)?.attempt.flags.length===10, "teacher sees every flag type for the student");
await as("student"); await AT.submitAttempt(acTest.id, { reason:"submitted", answers:{} }); await AT.logFlag(acTest.id, "copy");
assert((await get("/attempts")).find(a=>a.testId===acTest.id).flags.length===10, "flags after submitting are ignored");
await as("teacher");


// ── F7.3: randomization (server decides per attempt) ──
{
  const R = await import("@/lib/randomize"); const TS = await import("@/lib/testSettings");
  const qs = [
    { id:"a", type:"mcq", marks:1, options:["w","x","y","z"], correctIndex:2 },
    { id:"b", type:"mcq", marks:1, options:["p","q","All of the above"], correctIndex:2 },
    { id:"c", type:"truefalse", marks:1, options:["True","False"], correctIndex:1 },
    { id:"d", type:"short", marks:2, options:null, correctIndex:null },
    ...Array.from({length:8},(_,i)=>({ id:`m${i}`, type:"mcq", marks:1, options:["o1","o2","o3","o4"], correctIndex:i%4 })),
  ];
  const r1 = R.randomizeQuestions(qs, { shuffleQuestions:true, shuffleOptions:true, seed:"s1" });
  const r1b = R.randomizeQuestions(qs, { shuffleQuestions:true, shuffleOptions:true, seed:"s1" });
  assert(JSON.stringify(r1)===JSON.stringify(r1b), "randomize: same seed → same result");
  assert(JSON.stringify(R.randomizeQuestions(qs,{shuffleQuestions:true,shuffleOptions:true,seed:"s2"}).order)!==JSON.stringify(r1.order), "randomize: different seed → different order");
  assert([...r1.order.questions].sort().join()===qs.map(q=>q.id).sort().join() && r1.questions.length===qs.length, "randomize: nothing lost or duplicated");
  assert(JSON.stringify(qs).includes('"correctIndex":2')&&qs[0].options.join()==="w,x,y,z", "randomize: input not mutated");
  const keyOk = r1.questions.every(q=>{ const o=qs.find(x=>x.id===q.id); return !o.options || q.options[q.correctIndex]===o.options[o.correctIndex]; });
  assert(keyOk, "randomize: correctIndex follows the correct option text");
  assert(r1.questions.every(q=>{ const o=qs.find(x=>x.id===q.id); return !o.options || r1.order.options[q.id].every((orig,shown)=>q.options[shown]===o.options[orig]); }), "randomize: option order map points back to the original indices");
  assert(r1.questions.find(q=>q.id==="b").options[2]==="All of the above" && r1.questions.find(q=>q.id==="c").options.join()==="True,False", "randomize: 'All of the above' stays last; true/false untouched");
  const qOnly = R.randomizeQuestions(qs,{shuffleQuestions:true,shuffleOptions:false,seed:"s1"});
  assert(qOnly.questions.every(q=>q.options?.join()===qs.find(x=>x.id===q.id).options?.join()) && Object.keys(qOnly.order.options).length===0, "randomize: questions-only leaves options alone");
  const oOnly = R.randomizeQuestions(qs,{shuffleQuestions:false,shuffleOptions:true,seed:"s1"});
  assert(oOnly.order.questions.join()===qs.map(q=>q.id).join(), "randomize: options-only keeps question order");
  assert(R.randomizeQuestions(qs,{seed:"s1"}).questions.every((q,i)=>JSON.stringify(q)===JSON.stringify(qs[i])), "randomize: both off → untouched");
  assert(TS.DEFAULT_SETTINGS.shuffleQuestions===false && TS.DEFAULT_SETTINGS.shuffleOptions===false, "shuffle defaults: off");
  const lines = (s)=>TS.integrityRules({settings:{requireFullscreen:false,blockCopyPaste:false,...s}});
  assert(lines({}).length===1 && lines({shuffleQuestions:true}).length===2 && /Questions appear/.test(lines({shuffleQuestions:true})[0]) && /Answer options appear/.test(lines({shuffleOptions:true})[0]) && /Questions and answer options/.test(lines({shuffleQuestions:true,shuffleOptions:true})[0]), "intro rule names exactly what is shuffled");

  // end to end through the mock server: class mode, 3 students' worth of attempts via seeds of different ids
  await as("teacher");
  const mkS = async () => T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:6,marks:1},{type:"truefalse",count:2,marks:1},{type:"short",count:1,marks:2}], mode:"class" });
  const dS = await mkS();
  const orig = (await get("/tests")).find(x=>x.id===dS.id).questionSet;
  const pS = await T.publishTest(dS.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ shuffleQuestions:true, shuffleOptions:true, release:"immediately" } });
  assert(pS.settings.shuffleQuestions===true && pS.settings.shuffleOptions===true, "publish stores the shuffle switches");
  await as("student");
  assert((await get("/tests")).find(x=>x.id===dS.id).settings.shuffleOptions===true, "students receive the shuffle switches");
  const att = await AT.startAttempt(dS.id);
  assert(att.questions.length===orig.length && !("shuffle" in att) && att.questions.every(q=>!("correctIndex" in q)), "student attempt: all questions, no key, no order map");
  const again = await AT.startAttempt(dS.id);
  assert(JSON.stringify(again.questions)===JSON.stringify(att.questions), "resuming gives the same order");
  const stored = db().attempts.find(a=>a.id===att.id);
  assert(stored.shuffle && stored.shuffle.questions.join()===att.questions.map(q=>q.id).join(), "server stores the order map");
  // answer every choice question with the option whose TEXT is the original correct one; must grade full marks
  const answers = {};
  for (const q of att.questions) { const o = orig.find(x=>x.id===q.id); if (o.options) answers[q.id] = q.options.indexOf(o.options[o.correctIndex]); }
  await AT.submitAttempt(dS.id, { reason:"submitted", answers });
  const rev = await get(`/attempts/${att.id}/review`);
  const choiceItems = rev.items.filter(i=>i.correctIndex!==null);
  assert(choiceItems.length===8 && choiceItems.every(i=>i.grade.status==="final" && i.grade.marks===i.grade.max), "shuffled attempt: picking the right text earns full marks");
  assert(choiceItems.every(i=>i.question.options[i.correctIndex]===orig.find(x=>x.id===i.question.id).options[orig.find(x=>x.id===i.question.id).correctIndex]), "review marks the right option in the student's own order");
  assert(rev.items.map(i=>i.question.id).join()===att.questions.map(q=>q.id).join(), "review lists questions in the order the student saw");
  // unshuffled test keeps authored order and no map
  await as("teacher");
  const dP = await mkS(); const origP = (await get("/tests")).find(x=>x.id===dP.id).questionSet;
  await T.publishTest(dP.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3 });
  await as("student");
  const attP = await AT.startAttempt(dP.id);
  assert(attP.questions.map(q=>q.id).join()===origP.map(q=>q.id).join() && db().attempts.find(a=>a.id===attP.id).shuffle===null, "default (off): authored order, no map");
  await as("teacher");
}


// ── F7.4: teacher results + client-silent signal ──
{
  const RV = await import("@/lib/resultsView");
  const gen = (mix) => T.generateTest({ subjectId:"sub-phys-11a", mix, mode:"class" });
  const pub = (id) => T.publishTest(id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ release:"immediately" } });
  await as("teacher");
  const dA = await gen([{type:"mcq",count:4,marks:1},{type:"truefalse",count:2,marks:1}]);
  let e = await code(() => get(`/tests/${dA.id}/results`));
  assert(e?.status===409 && e.code==="NOT_PUBLISHED", "results: draft → 409 NOT_PUBLISHED");
  e = await code(() => get("/tests/nope/results")); assert(e?.status===404, "results: unknown test → 404");
  await pub(dA.id);
  const origA = (await get("/tests")).find(x=>x.id===dA.id).questionSet;
  let r = await get(`/tests/${dA.id}/results`);
  assert(r.test.title===dA.title && r.test.status==="live" && r.test.questionCount===6 && r.test.totalMarks===6, "results: test header");
  assert(r.summary.students===6 && r.summary.started===0 && r.summary.submitted===0 && r.summary.averagePercent===null && r.rows.length===6, "results: nobody started yet");
  await as("student");
  e = await code(() => get(`/tests/${dA.id}/results`)); assert(e?.status===403, "results: students can't read them");
  const att = await A.startAttempt(dA.id);
  await A.logFlag(dA.id, "tab-switch"); await A.logFlag(dA.id, "copy"); await A.logFlag(dA.id, "right-click");
  await as("teacher");
  r = await get(`/tests/${dA.id}/results`);
  const row = r.rows.find(x=>x.attempt?.id===att.id);
  assert(row && row.attempt.status==="in_progress" && row.attempt.marks===null && row.attempt.flags.length===3 && !("answers" in row.attempt), "results: open attempt — flags, no marks, no answers");
  assert(typeof row.attempt.lastSeenAt==="number" && row.attempt.clientSilent===false && r.summary.flagged===1 && r.summary.silent===0, "results: fresh attempt is not silent");
  // 2 minutes of nothing from the browser
  db().attempts.find(a=>a.id===att.id).lastSeenAt = Date.now()-120_000;
  r = await get(`/tests/${dA.id}/results`);
  assert(r.rows.find(x=>x.attempt?.id===att.id).attempt.clientSilent===true && r.summary.silent===1, "silent: no ping for 2 min → clientSilent");
  assert((await get(`/tests/${dA.id}/attempts`)).find(x=>x.attempt?.id===att.id).attempt.clientSilent===true, "silent: live roster says so too");
  await as("student"); await get(`/tests/${dA.id}/live-status`); await as("teacher");
  assert((await get(`/tests/${dA.id}/results`)).summary.silent===0, "silent: a live-status ping clears it");
  db().attempts.find(a=>a.id===att.id).lastSeenAt = Date.now()-120_000;
  await as("student"); await A.saveAnswer(att.id, att.questions[0].id, 0); await as("teacher");
  assert((await get(`/tests/${dA.id}/results`)).summary.silent===0, "silent: an autosave clears it too");
  // submit everything right
  await as("student");
  const answers = {}; for (const q of att.questions) { const o = origA.find(x=>x.id===q.id); answers[q.id] = o.correctIndex; }
  await A.submitAttempt(dA.id, { reason:"manual", answers });
  await as("teacher");
  r = await get(`/tests/${dA.id}/results`);
  const done = r.rows.find(x=>x.attempt?.id===att.id).attempt;
  assert(done.status==="submitted" && done.marks.earned===6 && done.marks.max===6 && done.marks.complete && done.clientSilent===false, "results: submitted attempt carries final marks");
  assert(r.summary.submitted===1 && r.summary.averagePercent===100 && r.summary.highestPercent===100 && r.summary.lowestPercent===100 && r.summary.awaitingMarks===0, "results: summary average/range");
  // a written question not yet confirmed → awaiting marks, left out of the average
  const dB = await gen([{type:"mcq",count:2,marks:1},{type:"short",count:1,marks:3}]);
  await T.publishTest(dB.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ release:"immediately", aiGrading:true } });
  await as("student"); const attB = await A.startAttempt(dB.id);
  await A.submitAttempt(dB.id, { reason:"manual", answers:{ [attB.questions.find(q=>q.type==="short").id]:"force equals mass times acceleration" } });
  await as("teacher");
  const rB = await get(`/tests/${dB.id}/results`);
  const doneB = rB.rows.find(x=>x.attempt?.id===attB.id).attempt;
  assert(doneB.marks.complete===false && rB.summary.awaitingMarks===1 && rB.summary.averagePercent===null, "results: unconfirmed written marks → awaiting, no average");
  await T.stopTestNow(dA.id);
  assert((await get(`/tests/${dA.id}/results`)).test.status==="completed", "results: still readable after the test ends");

  // presentation helpers
  const fl = [{type:"copy",at:5000},{type:"tab-switch",at:2000},{type:"tab-switch",at:9000},{type:"devtools-shortcut",at:7000}];
  const sm = RV.summarizeFlags(fl);
  assert(sm.count===4 && sm.top==="high" && sm.byType[0].type==="tab-switch" && sm.byType[0].count===2 && sm.byType.at(-1).severity==="low", "summarizeFlags: worst first, counted");
  assert(RV.summarizeFlags([]).top===null && RV.summarizeFlags(undefined).count===0, "summarizeFlags: empty");
  const tl = RV.flagTimeline(fl, 1000);
  assert(tl.map(x=>x.type).join()==="tab-switch,copy,devtools-shortcut,tab-switch" && tl[0].offsetMs===1000 && tl[0].label==="Switched tab or window", "flagTimeline: time order, offsets, labels");
  assert(RV.clock(754_000)==="12:34" && RV.clock(3_723_000)==="1:02:03" && RV.clock(-5)==="0:00", "clock formatting");
  assert(RV.rowState(null,false)==="not-started" && RV.rowState({status:"in_progress",clientSilent:true},false)==="silent" && RV.rowState({status:"in_progress"},true)==="closing" && RV.rowState({status:"submitted",marks:{complete:false}},true)==="marking" && RV.rowState({status:"submitted",marks:{complete:true}},true)==="submitted", "rowState");
  const rowsX = [{attempt:null},{attempt:{status:"submitted",marks:{complete:true},flags:[{type:"copy",at:1}]}},{attempt:{status:"submitted",marks:{complete:false},flags:[]}}];
  assert(rowsX.filter(x=>RV.matchesFilter(x,"flagged",true)).length===1 && rowsX.filter(x=>RV.matchesFilter(x,"marking",true)).length===1 && rowsX.filter(x=>RV.matchesFilter(x,"missing",true)).length===1 && rowsX.filter(x=>RV.matchesFilter(x,"all",true)).length===3, "matchesFilter");
  assert(RV.percentOf({earned:3,max:4})===75 && RV.percentOf(null)===null && RV.percentOf({earned:0,max:0})===null, "percentOf");
}


// ── U1: chart label wrapping ──
{
  const { wrapLabel } = await import("@/lib/textWrap");
  assert(JSON.stringify(wrapLabel("Kinematics", 20))==='["Kinematics"]', "wrapLabel: short label stays on one line");
  assert(JSON.stringify(wrapLabel("Newton's Laws of Motion", 14))==='["Newton\'s Laws","of Motion"]', "wrapLabel: breaks at spaces");
  const long = wrapLabel("Electromagnetic induction and alternating current", 14, 2);
  assert(long.length===2 && long.every(l=>l.length<=14) && long[1].endsWith("…"), "wrapLabel: too long → 2 lines ending in an ellipsis");
  assert(wrapLabel("Supercalifragilisticexpialidocious", 10)[0].length===10 && wrapLabel("Supercalifragilisticexpialidocious", 10)[0].endsWith("…"), "wrapLabel: one huge word is cut");
  assert(wrapLabel("", 10).length===0 && wrapLabel(null, 10).length===0 && wrapLabel("abc", 1).length===0, "wrapLabel: empty / no room");
}


// ── network failure ──
const realFetch = window.fetch; window.fetch = async () => { throw new TypeError("offline"); };
e = await code(() => get("/tests")); window.fetch = realFetch;
assert(e?.code==="NETWORK" && e.status===0 && /connection/.test(e.message), "network failure → friendly ApiError");
e = await code(() => get("/nope")); assert(e?.status===404, "unknown endpoint → 404");

// ── cache: refetch after a write ──
await as("teacher");
cache.clearCache(); let n = 0; const f = () => { n++; return get("/tests"); };
cache.register(["tests"], f); await cache.load(["tests"], f);
await T.saveTest(by("Bonding & Structure").id, { title:"Bonding & Structure" });
await new Promise(r=>setTimeout(r,30));
assert(n===2, "a successful write refetches the ['tests'] list");

// ── F8a: student analytics ──
{
  const AN = await import("@/lib/analytics");
  (await import("@/mocks/db")).resetMockData(); // earlier sections left extra tests behind; analytics needs the seeded history
  await as("student"); // Maya Okafor
  const a = await get("/analytics/me");
  assert(a.student.name==="Maya Okafor" && a.trend.length===5 && a.trend.map(p=>p.t).join()==="T1,T2,T3,T4,T5", "analytics: 5 counted tests, labelled T1…T5 oldest first");
  assert([68,74,71,80,83].every((t,i)=>Math.abs(a.trend[i].you-t)<=3), "analytics: Maya's scores track her seeded targets (±3: whole marks)");
  assert(a.trend.every((p,i,arr)=>i===0||arr[i].at>arr[i-1].at), "analytics: trend is chronological");
  assert(Math.abs(a.trend[0].class-Math.round((68+82+70+66+55+48)/6))<=3, "analytics: class average ≈ mean of classmates' % on that test");
  assert(a.summary.tests===5 && a.summary.average===Math.round(a.trend.reduce((n,p)=>n+p.you,0)/5) && a.summary.latest===a.trend[4].you && a.summary.changeSinceFirst===a.trend[4].you-a.trend[0].you, "analytics: summary average/latest/change are derived from the trend");
  assert(a.summary.awaiting===1, "analytics: Kinematics — Quiz has unconfirmed written marks → awaiting, not counted");
  assert(a.summary.testsAhead===a.trend.filter(p=>p.you>p.class).length && a.summary.aheadOfClass===a.trend[4].you-a.trend[4].class, "analytics: ahead-of-class counts");
  assert(a.topics.length===6 && a.topics.every(t=>t.accuracy>=0&&t.accuracy<=100&&t.trend.length>0), "analytics: six topics with accuracy and a trend");
  assert(a.summary.strongest.accuracy>=a.summary.weakest.accuracy && a.topics[0].name===a.summary.strongest.name, "analytics: strongest ≥ weakest, topics sorted best first");
  const acc = Object.fromEntries(a.topics.map(t=>[t.name,t.accuracy]));
  assert(acc["Newton's Laws of Motion"]+acc["Kinematics"] > acc["Electromagnetism"]+acc["Wave Optics"] && acc["Wave Optics"]>0, "analytics: topic profile follows the seeded strengths without being all-or-nothing");
  assert(!JSON.stringify(a).includes("Sofia") && !JSON.stringify(a).includes("Adrian"), "analytics: no classmate's name or marks leak");
  await as("teacher"); e = await code(() => get("/analytics/me")); assert(e?.status===403, "analytics/me: teachers get 403");
  await as("student");
  // a test that is submitted but not yet released (after_close, still open) is invisible
  await as("teacher");
  const dR = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:4,marks:1}], mode:"class" });
  await T.publishTest(dR.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ release:"after_close" } });
  await as("student");
  await A.startAttempt(dR.id);
  await A.submitAttempt(dR.id, { reason:"manual", answers:{} });
  assert((await get("/analytics/me")).summary.tests===5, "analytics: unreleased result isn't counted");
  await as("teacher");
  const dI = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:4,marks:1}], mode:"class" });
  await T.publishTest(dI.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ release:"immediately" } });
  await as("student");
  await A.startAttempt(dI.id); await A.submitAttempt(dI.id, { reason:"manual", answers:{} });
  const a2 = await get("/analytics/me");
  assert(a2.summary.tests===6 && a2.trend[5].t==="T6" && a2.trend[5].you===0, "analytics: an immediately-released result joins the trend (T6)");
  // library
  const s = AN.progressSentence;
  assert(/appears here/.test(s({tests:0})) && /One test so far: you scored 70%, the class averaged 65%/.test(s({tests:1,latest:70,classLatest:65})), "progressSentence: empty and single");
  assert(s({tests:5,startedAhead:-4,aheadOfClass:2})==="5 tests so far. You started 4 points below the class. You're now 2 points ahead." && /level with the class\.$/.test(s({tests:3,startedAhead:0,aheadOfClass:0})) && /1 point behind/.test(s({tests:2,startedAhead:1,aheadOfClass:-1})), "progressSentence: wording");
  const sc = AN.scoreAttempt({ questions:[{id:"a",marks:2,topic:"X"},{id:"b",marks:3,topic:"X"},{id:"c",marks:5,topic:"Y"}], grades:{ a:{status:"final",marks:2}, b:{status:"pending",marks:0}, c:{status:"final",marks:4} } });
  assert(sc.earned===6 && sc.max===10 && sc.complete===false && sc.byTopic.X.earned===2 && sc.byTopic.X.max===5 && sc.byTopic.Y.earned===4, "scoreAttempt: finals only, complete flag, per topic");
  assert(AN.pct(1,3)===33 && AN.pct(0,0)===null, "pct");
}

// ── F8b: teacher analytics ──
{
  const AN = await import("@/lib/analytics"); const CSV = await import("@/lib/csv");
  (await import("@/mocks/db")).resetMockData();
  await as("teacher");
  const q = "classId=cls-11a&subjectId=sub-phys-11a";
  const c = await get(`/analytics/class?${q}`);
  assert(c.cls.code==="11A" && c.subject.name==="Physics", "class analytics: scope echoed");
  assert(c.trend.map(p=>p.t).join()==="T1,T2,T3,T4,T5" && c.trend.every((p,i,a)=>i===0||p.at>a[i-1].at), "class analytics: 5 counted tests, oldest first");
  assert(!c.trend.some(p=>p.label==="Kinematics — Quiz") && c.summary.awaiting>=1, "class analytics: a test with unconfirmed marks isn't counted (awaiting reported)");
  const targets = [[68,82,70,66,55,48],[74,85,72,70,58,52],[71,84,75,74,52,50],[80,88,76,73,60,56],[83,90,78,77,57,54]];
  assert(targets.every((t,i)=>Math.abs(c.trend[i].class-Math.round(t.reduce((a,b)=>a+b,0)/6))<=3) && c.trend.every(p=>p.spread>0 && p.students===6), "class analytics: class mean ≈ seeded targets, spread > 0, 6 students each");
  assert(c.topics.length===6 && c.topics.every((t,i,a)=>i===0||t.accuracy<=a[i-1].accuracy) && c.topics.every(t=>Number.isInteger(t.affected)&&t.affected>=0&&t.affected<=6), "class analytics: topics best first, affected counts");
  assert(c.summary.belowTarget.length>0 && c.summary.belowTarget[0]===c.topics[c.topics.length-1].name && c.topics.filter(t=>t.accuracy<75).length===c.summary.belowTarget.length, "class analytics: belowTarget = topics under 75, weakest first");
  assert(c.students.length===6 && c.students[0].name==="Sofia Lindqvist" && c.students.at(-1).name==="Tomás Reyes" && c.students.every((s,i,a)=>i===0||s.overall<=a[i-1].overall), "class analytics: students sorted by overall");
  assert(c.students.every(s=>s.weak && s.strong && s.weak!==s.strong && s.tests===5), "class analytics: weakest/strongest topic per student");
  assert(c.summary.studentsAtRisk===c.students.filter(s=>s.overall<75).length && c.summary.studentsTotal===6 && c.summary.target===75, "class analytics: students at risk = under target");
  assert(c.summary.classAverage===c.trend[4].class && c.summary.changeSinceFirst===c.trend[4].class-c.trend[0].class && c.summary.spread===c.trend[4].spread, "class analytics: summary derived from trend");
  e = await code(()=>get("/analytics/class?classId=nope&subjectId=sub-phys-11a")); assert(e?.status===404, "class analytics: unknown class → 404");
  e = await code(()=>get("/analytics/class?classId=cls-11a&subjectId=nope")); assert(e?.status===404, "class analytics: unknown subject → 404");
  e = await code(()=>get("/analytics/class")); assert(e?.status===404, "class analytics: missing scope → 404");
  // student detail
  const maya = c.students.find(s=>s.name==="Maya Okafor");
  const d = await get(`/analytics/students/${maya.id}?${q}`);
  assert(d.student.name==="Maya Okafor" && d.trend.length===5 && d.summary.tests===5 && d.topics.length===6, "student detail: same shape as the student's own view");
  assert(d.recent.length===6 && d.recent.every((r,i,a)=>i===0||r.at<=a[i-1].at) && d.recent.filter(r=>r.percent===null).length===1, "student detail: attempts newest first; the unmarked one has percent null");
  e = await code(()=>get(`/analytics/students/nope?${q}`)); assert(e?.status===404, "student detail: unknown student → 404");
  await as("student"); e = await code(()=>get(`/analytics/class?${q}`)); assert(e?.status===403, "class analytics: students get 403");
  e = await code(()=>get(`/analytics/students/${maya.id}?${q}`)); assert(e?.status===403, "student detail: students get 403");
  // teachers see results that are not yet released to students
  await as("teacher");
  const dU = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:4,marks:1}], mode:"class" });
  await T.publishTest(dU.id, { availableFrom: Date.now()-1000, availableUntil: Date.now()+3600e3, settings:{ release:"after_close" } });
  await as("student"); await A.startAttempt(dU.id); await A.submitAttempt(dU.id, { reason:"manual", answers:{} });
  await as("teacher");
  const c2 = await get(`/analytics/class?${q}`);
  assert(c2.summary.tests===6 && c2.trend[5].students===1 && c2.trend[5].class===0, "class analytics: unreleased but fully graded work counts for the teacher");
  // library
  const tp = [{name:"A",accuracy:50,affected:4,trend:[60,50]},{name:"B",accuracy:70,affected:2,trend:[70,70]},{name:"C",accuracy:90,affected:0,trend:[88,90]}];
  const ins = AN.topicInsights(tp, { students:6, target:75 });
  assert(ins.length===3 && ins[0].kind==="weakest" && ins[0].tone==="danger" && ins[0].detail==="4 of 6 students are below 75%; down 10 points since T1" && ins[1].kind==="weak" && ins[1].tone==="warning" && ins[2].kind==="rest" && ins[2].accuracy===90, "topicInsights: weakest, next weakest, everything else");
  assert(AN.topicInsights([{name:"A",accuracy:80,affected:0,trend:[80]}], {students:6}).map(x=>x.name).join()==="Every topic" && AN.topicInsights([], {}).length===0, "topicInsights: all on target / none");
  const cs = AN.classSentence;
  assert(/No graded tests yet/.test(cs({tests:0})) && cs({tests:6,changeSinceFirst:12,belowTarget:["x","y"]})==="6 tests this term. The class is improving, but 2 topics are holding it back." && cs({tests:6,changeSinceFirst:-3,belowTarget:[]})==="6 tests this term. The class average has slipped, and every topic is on target." && /is flat, but 1 topic is holding/.test(cs({tests:3,changeSinceFirst:0,belowTarget:["x"]})) && cs({tests:1,changeSinceFirst:null,belowTarget:[]})==="One test so far. Every topic is on target.", "classSentence: wording");
  assert(CSV.toCsv(["a","b"],[["x,y","he said \"hi\""],[null,5]])==='a,b\r\n"x,y","he said ""hi"""\r\n,5\r\n' && CSV.toCsv(["n"],[["=1+1"],["-5"],["@x"]])==="n\r\n'=1+1\r\n-5\r\n'@x\r\n", "csv: quoting, empty cells, formula-injection guard (negative numbers untouched)");
}

// ── F8c: weak topics per variant, derived from analytics ──
{
  const AN = await import("@/lib/analytics"); const G = await import("@/mocks/generator");
  (await import("@/mocks/db")).resetMockData();
  await as("teacher");
  const q = "classId=cls-11a&subjectId=sub-phys-11a";
  const cls = await get(`/analytics/class?${q}`);
  const mid = (await get("/tests")).find(t=>t.title==="Thermodynamics — Mid-term");
  assert(mid.mode==="personal" && mid.variants.length===6, "seed: per-student test has one variant per student");
  const rowOf = (n) => cls.students.find(s=>s.name===n);
  const expect = (n) => { const r = rowOf(n); return r.overall!=null && r.weak && r.weakAccuracy<75 ? r.weak : null; };
  assert(mid.variants.every(v=>v.weakTopic===expect(v.studentName) && (v.weakTopic ? v.weakSource==="student" && typeof v.weakAccuracy==="number" : v.weakSource===null)), "variants: weak topic = the student's own lowest topic when it is under target, else none");
  assert(mid.variants.some(v=>v.weakTopic) && mid.variants.some(v=>v.weakTopic==="Wave Optics" || v.weakTopic==="Electromagnetism"), "variants: students get a real weak topic from their graded tests");
  assert(mid.variants.filter(v=>v.weakTopic).every(v=>v.questions.filter(x=>x.topic===v.weakTopic).length >= Math.max(1, Math.round(v.questions.length*0.25))), "variants: about a quarter of the questions lean on the weak topic");
  // a fresh personal test for 11A is generated from the same derivation
  const waitDone = async (id) => { for (let i=0;i<30;i++){ const p = await get(`/tests/${id}/generation`); if (p.status==="done") return; await sleep(400); } };
  const d = await T.generateTest({ subjectId:"sub-phys-11a", mix:[{type:"mcq",count:8,marks:1}], mode:"personal" });
  const dB = await T.generateTest({ subjectId:"sub-chem-11b", mix:[{type:"mcq",count:4,marks:1}], mode:"personal" }); // 11B Chemistry: no graded history (11B Physics now has one finished test)
  await waitDone(d.id); await waitDone(dB.id);
  const g = (await get("/tests")).find(t=>t.id===d.id);
  assert(g.variants.length===6 && g.variants.every(v=>v.weakTopic===expect(v.studentName)), "generate (personal): variants use the derived weak topics");
  // another class: its own students, and no history → no weak topics (not 11A's)
  const gB = (await get("/tests")).find(t=>t.id===dB.id);
  const names11A = new Set(cls.students.map(s=>s.name));
  assert(gB.variants.length>0 && gB.variants.every(v=>!names11A.has(v.studentName) && v.weakTopic===null), "generate (personal): uses the subject's class, not a fixed list; no history → no weak topic");
  // library
  const mkAttempt = (student, marks) => ({ testId:"t1", student, status:"submitted", flags:[], questions:[{id:"q1",marks:1,topic:"X"},{id:"q2",marks:1,topic:"Y"}], grades:{ q1:{status:"final",marks:marks[0]}, q2:{status:"final",marks:marks[1]} } });
  const roster = ["A","B","C"].map(n=>({id:n,name:n,roll:n}));
  const wm = AN.weakTopicMap({ tests:[{id:"t1",title:"T"}], attempts:[mkAttempt("A",[1,0]), mkAttempt("C",[1,1])], students:roster });
  assert(wm.A.topic==="Y" && wm.A.source==="student" && wm.A.accuracy===0, "weakTopicMap: own lowest topic");
  assert(wm.C===null, "weakTopicMap: nothing under target → null");
  assert(wm.B.topic==="Y" && wm.B.source==="class" && wm.B.accuracy===50, "weakTopicMap: no history → the class's weakest topic");
  assert(AN.weakTopicMap({ tests:[], attempts:[], students:roster }).B===null, "weakTopicMap: no data at all → null");
  const vs = G.buildVariants([{type:"mcq",count:8,marks:1}], [{name:"A"},{name:"B"}], { seed:3, topics:["P","Q","R","S"], weak:{ A:{topic:"Q",accuracy:40,source:"student"} } });
  assert(vs[0].weakTopic==="Q" && vs[0].weakSource==="student" && vs[0].weakAccuracy===40 && vs[0].questions.filter(x=>x.topic==="Q").length>=2 && vs[1].weakTopic===null && vs[1].weakSource===null, "buildVariants: emphasis only for students with a weak topic");
}

// ── F9a: courses & lessons ──
{
  const L = await import("@/lib/lms"); const C = await import("@/api/courses");
  (await import("@/mocks/db")).resetMockData();
  const call = client.call;
  await as("teacher");
  const phys = await get("/courses?subjectId=sub-phys-11a");
  assert(phys.length===2 && phys[0].lessons.length===5 && phys[0].students===6, "courses (teacher): the subject's courses with lessons and class size");
  assert(phys[0].lessons.every((l,i)=>l.order===i) && phys[0].lessons.map(l=>l.doneCount).join()==="6,5,4,2,1", "courses (teacher): ordered lessons, done counts from real progress");
  assert((await get("/courses?subjectId=sub-chem-11a")).length===1, "courses (teacher): another subject has its own courses");
  e = await code(()=>get("/courses?subjectId=nope")); assert(e?.status===404, "courses (teacher): unknown subject → 404");
  e = await code(()=>get("/courses")); assert(e?.status===404, "courses (teacher): needs a subject");

  await as("student"); // Maya
  const mine = await get("/courses");
  const newton = mine.find(c=>c.id==="crs-newton");
  assert(mine.length===3 && newton.progress.done===3 && newton.progress.total===5 && newton.progress.percent===60, "courses (student): every course of the class, own progress");
  assert(newton.lessons.map(l=>l.done).join()==="true,true,true,false,false" && newton.lessons.every(l=>!("doneCount" in l) && !("testId" in l)), "courses (student): own done flags; no class stats or internal ids");
  const waves = mine.find(c=>c.id==="crs-waves");
  assert(waves.lessons[1].test?.title==="Wave Optics — Quiz 2" && waves.lessons[1].test.status==="live" && waves.lessons[0].test===null, "courses (student): related test with its status");
  let r = await C.setLessonDone("crs-newton-l4", true);
  assert(r.progress.done===4 && r.progress.percent===80 && r.lessons[3].done===true, "progress: mark a lesson done");
  r = await C.setLessonDone("crs-newton-l4", true);
  assert(r.progress.done===4, "progress: marking twice is idempotent");
  await as("teacher"); assert((await get("/courses?subjectId=sub-phys-11a"))[0].lessons[3].doneCount===3, "progress: the teacher's count follows (2 → 3)");
  await as("student");
  r = await C.setLessonDone("crs-newton-l4", false); assert(r.progress.done===3, "progress: undo");
  e = await code(()=>C.setLessonDone("crs-newton-l1", "yes")); assert(e?.status===400, "progress: done must be a boolean");
  e = await code(()=>C.setLessonDone("nope", true)); assert(e?.status===404, "progress: unknown lesson → 404");
  e = await code(()=>C.createCourse({ subjectId:"sub-phys-11a", title:"X" })); assert(e?.status===403, "students can't create courses");
  await as("teacher"); e = await code(()=>C.setLessonDone("crs-newton-l1", true)); assert(e?.status===403, "teachers can't mark progress");

  // teacher CRUD
  let c = await C.createCourse({ subjectId:"sub-phys-11a", title:"  Thermodynamics basics  " });
  assert(c.title==="Thermodynamics basics" && c.lessons.length===0 && c.students===6, "create course: trimmed title, empty");
  e = await code(()=>C.createCourse({ subjectId:"sub-phys-11a", title:"   " })); assert(e?.status===400 && e.code==="INVALID_COURSE", "create course: title required");
  e = await code(()=>C.createCourse({ subjectId:"nope", title:"x" })); assert(e?.status===404, "create course: unknown subject → 404");
  c = await C.renameCourse(c.id, "Heat & work"); assert(c.title==="Heat & work", "rename course");
  const bad = async (lesson, msg) => { const x = await code(()=>C.addLesson(c.id, lesson)); assert(x?.status===400 && x.code==="INVALID_LESSON", msg); };
  await bad({ kind:"text", title:"A", body:"" }, "lesson: text needs content");
  await bad({ kind:"video", title:"A", url:"" }, "lesson: video needs a URL");
  await bad({ kind:"video", title:"A", url:"javascript:alert(1)" }, "lesson: javascript: links are refused");
  await bad({ kind:"file", title:"A", url:"ftp://x/y.pdf" }, "lesson: only http(s) links");
  await bad({ kind:"text", title:"x".repeat(141), body:"b" }, "lesson: title length limit");
  await bad({ kind:"audio", title:"A", body:"b" }, "lesson: unknown type");
  const draftTest = (await get("/tests")).find(t=>t.status==="draft" && t.subjectId==="sub-phys-11a");
  e = await code(()=>C.addLesson(c.id, { kind:"text", title:"A", body:"b", testId: draftTest.id })); assert(e?.status===400 && e.code==="INVALID_TEST", "lesson: a draft test can't be linked");
  const chemTest = (await get("/tests")).find(t=>t.subjectId==="sub-chem-11a");
  e = await code(()=>C.addLesson(c.id, { kind:"text", title:"A", body:"b", testId: chemTest.id })); assert(e?.status===400 && e.code==="INVALID_TEST", "lesson: a test of another subject can't be linked");
  const liveTest = (await get("/tests")).find(t=>t.title==="Wave Optics — Quiz 2");
  c = await C.addLesson(c.id, { kind:"text", title:"First law", body:"Energy is conserved.", duration:"5 min", testId: liveTest.id });
  c = await C.addLesson(c.id, { kind:"video", title:"Engines", url:"https://youtu.be/abc", url2:"ignored" });
  c = await C.addLesson(c.id, { kind:"file", title:"Cheat sheet", url:"https://example.com/a.pdf", body:"" });
  assert(c.lessons.map(l=>l.title).join()==="First law,Engines,Cheat sheet" && c.lessons.map(l=>l.order).join()==="0,1,2" && c.lessons[0].testId===liveTest.id && c.lessons[0].url==="" && !("url2" in c.lessons[1]), "add lessons: appended in order, text lessons keep no URL, unknown fields dropped");
  const ids = c.lessons.map(l=>l.id);
  c = await C.reorderLessons(c.id, [ids[2], ids[0], ids[1]]); assert(c.lessons.map(l=>l.id).join()===[ids[2],ids[0],ids[1]].join(), "reorder: new order saved");
  e = await code(()=>C.reorderLessons(c.id, [ids[0], ids[1]])); assert(e?.status===400 && e.code==="INVALID_ORDER", "reorder: must list every lesson");
  e = await code(()=>C.reorderLessons(c.id, [ids[0], ids[0], ids[1]])); assert(e?.status===400, "reorder: no duplicates");
  c = await C.updateLesson(ids[1], { kind:"text", title:"First law (revised)", body:"Updated." }); assert(c.lessons.find(l=>l.id===ids[1]).title==="First law (revised)" && c.lessons.find(l=>l.id===ids[1]).testId===null, "update lesson: replaces the editable fields (test link cleared)");
  await as("student"); await C.setLessonDone(ids[0], true); await as("teacher");
  assert(db().lessonProgress.some(p=>p.lessonId===ids[0]), "progress row exists before delete");
  c = await C.deleteLesson(ids[2]); assert(c.lessons.length===2 && c.lessons.map(l=>l.order).join()==="0,1", "delete lesson: remaining lessons renumbered");
  c = await C.deleteLesson(ids[0]); assert(!db().lessonProgress.some(p=>p.lessonId===ids[0]), "delete lesson: its progress goes too");
  // related test cleanup + subject guard
  c = await C.updateLesson(ids[1], { kind:"text", title:"Linked", body:"b", testId:(await get("/tests")).find(t=>t.title==="Kinematics — Quiz").id });
  const kq = (await get("/tests")).find(t=>t.title==="Kinematics — Quiz");
  await call(`/tests/${kq.id}`, { method:"DELETE" });
  assert(db().lessons.find(l=>l.id===ids[1]).testId===null, "deleting a test unlinks lessons that pointed at it");
  const sub = await call("/subjects", { method:"POST", body:{ classId:"cls-11a", name:"Astronomy" } });
  const ac = await C.createCourse({ subjectId: sub.id, title:"Stars" });
  e = await code(()=>call(`/subjects/${sub.id}`, { method:"DELETE" })); assert(e?.status===409 && e.code==="SUBJECT_IN_USE", "a subject with courses can't be deleted");
  await C.deleteCourse(ac.id); await call(`/subjects/${sub.id}`, { method:"DELETE" });
  assert(!db().subjects.some(x=>x.id===sub.id), "…but can once its courses are gone");
  await C.deleteCourse(c.id);
  assert(!db().courses.some(x=>x.id===c.id) && !db().lessons.some(l=>l.courseId===c.id), "delete course: lessons removed with it");
  e = await code(()=>C.renameCourse("nope","x")); assert(e?.status===404, "rename: unknown course → 404");

  // library
  assert(L.validateLesson({kind:"text",title:"t",body:"b"})===null && L.validateLesson({kind:"video",title:"t",url:"https://a.b/c"})===null && /Title is required/.test(L.validateLesson({kind:"text",title:" ",body:"b"})) && /http/.test(L.validateLesson({kind:"file",title:"t",url:"javascript:1"})), "validateLesson");
  assert(L.isHttpUrl("https://x.y")&&L.isHttpUrl(" http://x.y ")&&!L.isHttpUrl("javascript:alert(1)")&&!L.isHttpUrl("data:text/html,x")&&!L.isHttpUrl("//x.y")&&!L.isHttpUrl(""), "isHttpUrl");
  assert(L.moveId(["a","b","c"],"b","up").join()==="b,a,c" && L.moveId(["a","b","c"],"b","down").join()==="a,c,b" && L.moveId(["a","b"],"a","up").join()==="a,b" && L.moveId(["a","b"],"z","down").join()==="a,b", "moveId");
  assert(L.isPermutation(["b","a"],["a","b"]) && !L.isPermutation(["a","a"],["a","b"]) && !L.isPermutation(["a"],["a","b"]) && !L.isPermutation(null,["a"]), "isPermutation");
  assert(JSON.stringify(L.courseProgress([{done:true},{done:false},{done:true}], l=>l.done))==='{"done":2,"total":3,"percent":67}' && L.courseProgress([],()=>true).percent===0 && L.nextLesson([{done:true},{id:2,done:false}]).id===2 && L.nextLesson([{done:true}])===null, "courseProgress / nextLesson");
}

// ── F9b: class discussion ──
{
  const D = await import("@/lib/discussion"); const TH = await import("@/api/threads");
  (await import("@/mocks/db")).resetMockData();
  const teacherU = await as("teacher");
  const list = await get("/threads?classId=cls-11a");
  assert(list.length===5 && list.every(t=>t.classId==="cls-11a" && typeof t.createdAt==="number" && Array.isArray(t.replies)), "threads (teacher): the class's five seeded threads");
  assert(list.find(t=>t.id==="th1").replies.map(r=>r.author).join()==="Maya Okafor,Dr. R. Chen" && list.find(t=>t.id==="th1").replies.every((r,i,a)=>i===0||r.createdAt>=a[i-1].createdAt), "threads: replies in time order with real authors");
  assert(list.find(t=>t.id==="th2").authorId==="u-teacher" && list.find(t=>t.id==="th2").role==="teacher" && list.find(t=>t.id==="th1").authorId===db().users.find(u=>u.name==="Tomás Reyes").id, "threads: authors are linked to accounts");
  e = await code(()=>get("/threads")); assert(e?.status===404, "threads (teacher): needs a class");
  e = await code(()=>get("/threads?classId=cls-10a")); assert(e?.status===404, "threads (teacher): a class that isn't theirs → 404");
  assert((await get("/threads?classId=cls-11b")).length===0, "threads (teacher): another class has its own (empty) discussion");

  const maya = await as("student");
  assert((await get("/threads")).length===5 && (await get("/threads?classId=cls-11b")).length===5, "threads (student): their own class, whatever classId they send");
  let t = await TH.createThread({ title:"  How do I read a v–t graph?  ", body:"  Is the area the distance?  ", tag:"Question" });
  assert(t.title==="How do I read a v–t graph?" && t.body==="Is the area the distance?" && t.author===maya.name && t.authorId===maya.id && t.role==="student" && t.classId==="cls-11a" && t.replies.length===0 && !t.pinned && !t.resolved && Math.abs(t.createdAt-Date.now())<5000, "create thread: trimmed, author and time come from the server");
  const bad = async (body, msg) => { const x = await code(()=>TH.createThread(body)); assert(x?.status===400 && x.code==="INVALID_THREAD", msg); };
  await bad({ title:"A", body:"b", tag:"Announcement" }, "create thread: students can't post announcements");
  await bad({ title:" ", body:"b", tag:"Question" }, "create thread: title required");
  await bad({ title:"A", body:"", tag:"Question" }, "create thread: body required");
  await bad({ title:"x".repeat(141), body:"b", tag:"Question" }, "create thread: title length limit");
  await bad({ title:"A", body:"b", tag:"Gossip" }, "create thread: unknown category");
  // replies
  let r = await TH.addReply(t.id, "  Yes, the area under it.  ");
  assert(r.replies.length===1 && r.replies[0].author===maya.name && r.replies[0].body==="Yes, the area under it." && r.lastActivityAt>=t.lastActivityAt, "reply: posted by the signed-in person, thread activity updates");
  e = await code(()=>TH.addReply(t.id, "   ")); assert(e?.status===400 && e.code==="INVALID_REPLY", "reply: can't be empty");
  e = await code(()=>TH.addReply(t.id, "x".repeat(3001))); assert(e?.status===400, "reply: length limit");
  e = await code(()=>TH.addReply("nope", "hi")); assert(e?.status===404, "reply: unknown thread → 404");
  // permissions
  e = await code(()=>TH.updateThread("th4", { pinned:true })); assert(e?.status===403, "pin: students can't");
  e = await code(()=>TH.updateThread("th1", { resolved:true })); assert(e?.status===403, "resolve: a student can't resolve someone else's thread");
  r = await TH.updateThread(t.id, { resolved:true }); assert(r.resolved===true, "resolve: the author can resolve their own thread");
  e = await code(()=>TH.updateThread(t.id, { resolved:"yes" })); assert(e?.status===400, "resolve: must be a boolean");
  e = await code(()=>TH.deleteThread(t.id)); assert(e?.status===403, "delete thread: students can't");
  e = await code(()=>TH.deleteReply(t.id, r.replies[0].id)); assert(e?.status===403, "delete reply: students can't");
  await as("admin"); e = await code(()=>get("/threads")); assert(e?.status===403, "threads: admins have no discussion");
  await as("teacher");
  r = await TH.updateThread(t.id, { pinned:true, resolved:false }); assert(r.pinned===true && r.resolved===false, "teacher: pin + reopen in one call");
  const ann = await TH.createThread({ classId:"cls-11a", title:"Quiz Friday", body:"Chapters 3–4.", tag:"Announcement" });
  assert(ann.role==="teacher" && ann.tag==="Announcement" && ann.author===teacherU.name, "teacher: can post announcements");
  e = await code(()=>TH.createThread({ title:"A", body:"b", tag:"Question" })); assert(e?.status===404, "teacher: creating a thread needs a class");
  r = await TH.deleteReply(t.id, t.replies.length ? t.replies[0].id : r.replies[0].id); assert(r.replies.length===0, "delete reply: teacher");
  e = await code(()=>TH.deleteReply(t.id, "nope")); assert(e?.status===404, "delete reply: unknown reply → 404");
  await TH.deleteThread(t.id); assert(!db().threads.some(x=>x.id===t.id), "delete thread: teacher");
  e = await code(()=>TH.deleteThread(t.id)); assert(e?.status===404, "delete thread: already gone → 404");

  // library
  const now = 1_000_000_000_000;
  assert(D.timeAgo(now-10_000,now)==="Just now" && D.timeAgo(now-12*60_000,now)==="12 min ago" && D.timeAgo(now-3600_000,now)==="1 hour ago" && D.timeAgo(now-3*3600_000,now)==="3 hours ago" && D.timeAgo(now-26*3600_000,now)==="yesterday" && D.timeAgo(now-4*86400_000,now)==="4 days ago" && /^[A-Z][a-z]{2} \d{1,2}$/.test(D.timeAgo(now-30*86400_000,now)) && D.timeAgo(now+5000,now)==="Just now", "timeAgo");
  assert(D.tagsFor("student").join()==="Question,Discussion,Resource" && D.tagsFor("teacher").includes("Announcement"), "tagsFor");
  assert(D.validateThread({title:"a",body:"b",tag:"Question"},"student")===null && /announcements/.test(D.validateThread({title:"a",body:"b",tag:"Announcement"},"student")) && D.validateReply("ok")===null && /first/.test(D.validateReply(" ")), "validateThread / validateReply");
  assert(D.canResolve("teacher","x",{authorId:"y"}) && D.canResolve("student","y",{authorId:"y"}) && !D.canResolve("student","x",{authorId:"y"}), "canResolve");
  assert(D.sortThreads([{id:"a",pinned:false,lastActivityAt:5},{id:"b",pinned:true,lastActivityAt:1},{id:"c",pinned:false,lastActivityAt:9}]).map(x=>x.id).join()==="b,c,a", "sortThreads: pinned first, then most recent activity");
}

// ── guard: components may only read what AppContext provides ──
// (A removed context field once crashed the Sidebar at render time; nothing in this
// node-only suite renders components, so check the source statically.)
{
  const fs = await import("node:fs"); const path = await import("node:path");
  const walk = (d) => fs.readdirSync(d, { withFileTypes:true }).flatMap(x => x.isDirectory() ? walk(path.join(d,x.name)) : [path.join(d,x.name)]);
  const ctx = fs.readFileSync("src/context/AppContext.jsx","utf8");
  const block = ctx.slice(ctx.indexOf("const value = useMemo"), ctx.indexOf("[", ctx.indexOf("const value = useMemo") + 40) > 0 ? ctx.indexOf("}),", ctx.indexOf("const value = useMemo")) : undefined);
  const provided = new Set([...block.matchAll(/\b([A-Za-z_]\w*)\b(?=\s*[,\n])/g)].map(m=>m[1]));
  const bad = [];
  walk("src").filter(f=>/\.jsx?$/.test(f)).forEach(f => {
    const src = fs.readFileSync(f,"utf8");
    for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*useApp\(\)/g))
      m[1].split(",").map(n=>n.split(":")[0].trim()).filter(Boolean).forEach(n => { if (!provided.has(n)) bad.push(`${f}: ${n}`); });
    for (const m of src.matchAll(/useApp\(\)\.(\w+)/g)) if (!provided.has(m[1])) bad.push(`${f}: .${m[1]}`);
  });
  assert(provided.has("activeClassObj") && provided.has("signOut") && !provided.has("courses"), "context guard: parsed the provided names");
  assert(bad.length===0, "context guard: every useApp() field exists in AppContext" + (bad.length ? " — missing: " + bad.join("; ") : ""));
}

// ── Tests list rules (src/lib/draftRows.js) ──
{
  const R = await import("@/lib/draftRows");
  const plan = (status) => R.rowPlan({ status });
  assert(plan("draft").primary.id === "publish" && plan("scheduled").primary.id === "start" && plan("live").primary.id === "live" && plan("completed").primary.id === "results", "rowPlan: one main action per status");
  assert(!plan("live").menu.some((m) => m.id === "delete") && plan("live").menu.some((m) => m.id === "stop" && m.danger), "rowPlan: live tests can be stopped but not deleted");
  assert(["draft", "scheduled", "completed"].every((s) => plan(s).menu.at(-1).id === "delete" && plan(s).menu.at(-1).danger), "rowPlan: Delete is last, danger-styled, in the menu");
  assert(plan("draft").menu.every((m) => m.id !== plan("draft").primary.id), "rowPlan: primary action is not repeated in the menu");
  const c = R.statusCounts([{ status: "draft" }, { status: "live" }, { status: "live" }, { status: "completed" }]);
  assert(c.all === 4 && c.draft === 1 && c.live === 2 && c.scheduled === 0 && c.completed === 1, "statusCounts");
  assert(R.statusNote({ status: "live", progress: { started: 20, submitted: 18, expected: 28 } }) === "18 of 28 submitted", "statusNote: live progress");
  assert(R.statusNote({ status: "live", progress: { started: 3, submitted: 0, expected: 0 } }) === "3 started", "statusNote: live without roster size");
  assert(/^Opens /.test(R.statusNote({ status: "scheduled", schedule: { availableFrom: Date.UTC(2026, 10, 12, 9, 0) } })), "statusNote: scheduled shows opening time");
  assert(R.statusNote({ status: "draft" }) === null && R.statusNote({ status: "completed" }) === null, "statusNote: nothing for draft/completed");
  await as("teacher");
  const list = await get("/tests");
  const live = list.filter((t) => t.status === "live");
  assert(live.length > 0 && live.every((t) => t.progress && t.progress.expected >= t.progress.submitted && t.progress.submitted <= t.progress.started), "GET /tests: live tests carry progress {started, submitted, expected}");
  assert(list.filter((t) => t.status !== "live").every((t) => t.progress === undefined), "GET /tests: only live tests carry progress");
}

// ── Shortcut hint wording (src/lib/platform.js) ──
{
  const P = await import("@/lib/platform");
  const withNav = (nav, fn) => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    try { return fn(); } finally { saved ? Object.defineProperty(globalThis, "navigator", saved) : delete globalThis.navigator; }
  };
  assert(withNav({ platform: "MacIntel" }, () => P.shortcutLabel("K")) === "⌘K", "shortcutLabel: Mac shows ⌘K (no plus)");
  assert(withNav({ userAgentData: { platform: "macOS" }, platform: "" }, () => P.shortcutLabel("K")) === "⌘K", "shortcutLabel: userAgentData macOS");
  assert(withNav({ platform: "iPad" }, () => P.isMacLike()) === true, "isMacLike: iPad");
  assert(withNav({ platform: "Win32" }, () => P.shortcutLabel("K")) === "Ctrl+K", "shortcutLabel: Windows shows Ctrl+K");
  assert(withNav({ userAgentData: { platform: "Windows" }, platform: "Win32" }, () => P.modKeyLabel()) === "Ctrl", "modKeyLabel: Windows");
  assert(withNav({ platform: "Linux armv81" }, () => P.shortcutLabel("K")) === "Ctrl+K", "shortcutLabel: Android/Linux");
}

// ── F11a: audit log (lib/sha256, lib/audit, mocks/audit*) ──
{
  const { resetMockData } = await import("@/mocks/db");
  const AU = await import("@/lib/audit");
  const { sha256Hex } = await import("@/lib/sha256");
  const nodeCrypto = await import("node:crypto");
  resetMockData();

  // hashing
  assert(sha256Hex("") === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "sha256: empty string vector");
  assert(sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256: abc vector");
  const samples = [1, 55, 56, 63, 64, 65, 119, 120, 1000].map((n) => "x".repeat(n)).concat(["مرحبا Maya – ✓ 😀", "line1\nline2"]);
  assert(samples.every((t) => sha256Hex(t) === nodeCrypto.createHash("sha256").update(t, "utf8").digest("hex")), "sha256: identical to node:crypto (padding edges + unicode)");
  assert(AU.canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] }) === '{"a":[2,{"d":1}],"b":1}', "canonicalJson: sorted keys, undefined dropped");

  // reason rule
  const nr = AU.needsReason;
  assert(nr({ max: 4, current: 3, ai: 3, to: 2 }) === true, "needsReason: exactly 25% of the marks needs a reason");
  assert(nr({ max: 8, current: 6, ai: 6, to: 5 }) === false, "needsReason: a small nudge does not");
  assert(nr({ max: 8, current: 5, ai: 6, to: 4 }) === true, "needsReason: measured from the AI mark, so small nudges can't add up unseen");
  assert(nr({ max: 8, current: null, to: 3 }) === false && nr({ max: 8, current: 3, to: 3 }) === false, "needsReason: first manual mark / unchanged never needs one");
  assert(nr({ max: 10, current: 5, ai: 5, to: 6, afterRelease: true }) === true && nr({ max: 10, current: 5, to: 5, afterRelease: true }) === false, "needsReason: any change after release, none when unchanged");

  // seed chain
  const seeded = db().auditLog;
  assert(seeded.length > 30 && AU.verifyChain(seeded).ok, "seed: audit chain verifies");
  assert(seeded.filter((x) => x.type === "attempt.start").length === db().attempts.length && seeded.filter((x) => x.type === "attempt.submit").length === db().attempts.length, "seed: a start and a submit per attempt");
  const aiGrades = db().attempts.flatMap((a) => Object.values(a.grades ?? {})).filter((g) => g.aiMarks != null).length;
  assert(aiGrades > 0 && seeded.filter((x) => x.type === "grade.ai_draft").length === aiGrades, "seed: one ai_draft event per AI mark");
  assert(seeded.every((x, i) => x.seq === i + 1) && seeded.every((x, i) => i === 0 || x.at >= seeded[i - 1].at), "seed: seq has no gaps, time never goes backwards");

  // tampering is detected
  const copy1 = structuredClone(seeded); copy1[10].after = { marks: 99 };
  const v1 = AU.verifyChain(copy1); assert(!v1.ok && v1.badSeq === copy1[10].seq && v1.reason === "hash", "tamper: edited event -> hash mismatch at its seq");
  const copy2 = structuredClone(seeded); copy2.splice(5, 1);
  const v2 = AU.verifyChain(copy2); assert(!v2.ok && v2.badSeq === 7 && v2.reason === "seq", "tamper: deleted event -> gap detected");
  const copy3 = structuredClone(seeded); copy3[7].prevHash = "0".repeat(64);
  assert(AU.verifyChain(copy3).reason === "prev", "tamper: broken link -> prev mismatch");

  // handlers write events
  const last = () => db().auditLog.length;
  const since = (n) => db().auditLog.slice(n);
  await as("teacher");
  let n = last();
  const ta = await T.generateTest({ ...cfg, title: "Audit A" });
  let ev = since(n);
  assert(ev.length === 1 && ev[0].type === "test.generate" && ev[0].entity.id === ta.id && ev[0].actor.role === "teacher" && ev[0].testId === ta.id, "generate -> test.generate by the teacher");
  n = last(); await T.saveTest(ta.id, { title: "Audit A2" });
  assert(since(n).length === 0, "editing a draft is not logged (autosave)");
  n = last(); const dup = await T.duplicateTest(ta.id);
  assert(since(n).length === 1 && since(n)[0].type === "test.duplicate" && since(n)[0].meta.sourceId === ta.id, "duplicate -> test.duplicate");
  n = last(); await T.deleteTest(dup.id);
  ev = since(n); assert(ev.length === 1 && ev[0].type === "test.delete" && ev[0].before.title && ev[0].meta.attempts === 0, "delete -> test.delete with what was removed");
  n = last(); await T.publishTest(ta.id, { settings: { release: "immediately" } });
  ev = since(n); assert(ev.length === 1 && ev[0].type === "test.publish" && /^[0-9a-f]{64}$/.test(ev[0].after.settingsHash), "publish -> test.publish with a settings hash");
  n = last(); await T.extendTest(ta.id, 5);
  assert(since(n)[0]?.type === "test.extend" && since(n)[0].meta.minutes === 5, "extend -> test.extend");

  await as("student");
  n = last(); const att = await A.startAttempt(ta.id);
  ev = since(n); assert(ev.length === 1 && ev[0].type === "attempt.start" && ev[0].entity.id === att.id && ev[0].studentId, "start -> attempt.start");
  n = last(); await A.startAttempt(ta.id);
  assert(since(n).length === 0, "resuming an attempt logs nothing");
  const keyed = db().tests.find((t) => t.id === ta.id).questionSet;
  const answers = {}; keyed.forEach((q) => { answers[q.id] = q.options ? q.correctIndex : q.expectedAnswer; });
  n = last(); await A.submitAttempt(ta.id, { reason: "manual", answers });
  ev = since(n); const submitEv = ev.find((x) => x.type === "attempt.submit");
  assert(submitEv && submitEv.meta.reason === "manual" && submitEv.meta.answerDigest === sha256Hex(AU.canonicalJson(db().attempts.find((a) => a.id === att.id).answers)), "submit -> attempt.submit with the answers' digest");
  assert(ev.filter((x) => x.type === "grade.ai_draft").length === 2 && ev.filter((x) => x.type === "grade.ai_draft").every((x) => x.actor.role === "system" && x.meta.model && x.after.marks != null), "submit -> one ai_draft per written answer, by the system");
  n = last(); await A.submitAttempt(ta.id, { reason: "manual" });
  assert(since(n).length === 0, "a second submit logs nothing");

  // grading: reason rule + events
  await as("teacher");
  const q = (await get("/grading/queue")).filter((i) => i.attemptId === att.id);
  assert(q.length === 2 && q.every((i) => i.released === true), "queue items say whether the result is released");
  const it = q[0];
  const to = it.aiScore >= 0.5 * it.maxScore ? 0 : it.maxScore;
  n = last();
  e = await code(() => G.reviewGrade(it.attemptId, it.questionId, { marks: to, final: true }));
  assert(e?.status === 400 && e.code === "REASON_REQUIRED" && since(n).length === 0, "big override without a reason -> 400 REASON_REQUIRED, nothing logged");
  e = await code(() => G.reviewGrade(it.attemptId, it.questionId, { marks: to, final: true, reason: "   " }));
  assert(e?.code === "REASON_REQUIRED", "a blank reason does not count");
  e = await code(() => client.call(`/grades/${it.attemptId}/${it.questionId}`, { method: "PATCH", body: { marks: to, final: true, reason: "x".repeat(501) } }));
  assert(e?.status === 400 && e.code === "INVALID_INPUT", "reason over 500 characters -> 400");
  await G.reviewGrade(it.attemptId, it.questionId, { marks: to, final: true, reason: "Checked against the model answer" });
  ev = since(n); assert(ev.length === 1 && ev[0].type === "grade.override" && ev[0].before.marks === it.aiScore && ev[0].after.marks === to && ev[0].meta.reason === "Checked against the model answer" && ev[0].meta.aiMarks === it.aiScore && ev[0].meta.afterRelease === false, "override -> grade.override with before/after, reason and the AI's mark");
  const nudge = to > 0 ? to - 1 : to + 1;
  n = last();
  e = await code(() => G.reviewGrade(it.attemptId, it.questionId, { marks: nudge, final: true }));
  assert(e?.code === "REASON_REQUIRED", "any change after release needs a reason, even a small one");
  await G.reviewGrade(it.attemptId, it.questionId, { marks: nudge, final: true, reason: "Student asked for a recheck" });
  assert(since(n)[0].type === "grade.override" && since(n)[0].meta.afterRelease === true, "change after release -> flagged afterRelease");
  n = last(); await G.reviewGrade(it.attemptId, it.questionId, { marks: nudge, final: true, feedback: "Well explained" });
  assert(since(n).length === 1 && since(n)[0].type === "grade.feedback" && since(n)[0].meta.afterRelease === true, "feedback-only edit -> grade.feedback (no reason needed, still flagged)");
  const it2 = q[1];
  n = last(); await G.approveGrades([{ attemptId: it2.attemptId, questionId: it2.questionId }]);
  ev = since(n); assert(ev.length === 1 && ev[0].type === "grade.approve" && ev[0].meta.bulk === false && ev[0].before.status === "ai_draft" && ev[0].after.status === "final", "approve one -> grade.approve (not bulk)");
  const kin2 = (await get("/grading/queue")).filter((i) => /^Kinematics/.test(i.test) && /Quiz$/.test(i.test) && i.status === "pending");
  n = last(); await G.approveGrades(kin2.slice(0, 3).map((i) => ({ attemptId: i.attemptId, questionId: i.questionId })));
  ev = since(n); assert(ev.length === 3 && ev.every((x) => x.type === "grade.approve" && x.meta.bulk === true && x.meta.batchId === ev[0].meta.batchId), "bulk approve -> one event per mark, same batchId, bulk:true");
  n = last(); await G.approveGrades([{ attemptId: it2.attemptId, questionId: it2.questionId }]);
  assert(since(n).length === 0, "approving an already final mark logs nothing");
  const kinP = kin2[5];
  n = last(); await G.reviewGrade(kinP.attemptId, kinP.questionId, { marks: kinP.score, final: true });
  assert(since(n).length === 1 && since(n)[0].type === "grade.approve", "PATCH with the AI's mark unchanged -> grade.approve");

  // manual marking (AI grading off)
  const tm = await T.generateTest({ ...cfg, title: "Audit manual" }); await T.publishTest(tm.id, { settings: { aiGrading: false } });
  await as("student"); const am = await A.startAttempt(tm.id);
  const kq = db().tests.find((t) => t.id === tm.id).questionSet; const ans2 = {}; kq.forEach((x) => { ans2[x.id] = x.options ? x.correctIndex : "my answer"; });
  n = last(); await A.submitAttempt(tm.id, { reason: "manual", answers: ans2 });
  assert(since(n).filter((x) => x.type === "grade.ai_draft").length === 0, "AI grading off: no ai_draft events");
  await as("teacher");
  const mi = (await get("/grading/queue")).find((i) => i.attemptId === am.id && i.manual);
  n = last(); await G.reviewGrade(mi.attemptId, mi.questionId, { marks: 2, final: true });
  ev = since(n); assert(ev.length === 1 && ev[0].type === "grade.manual" && ev[0].before.marks === null && ev[0].after.marks === 2, "first manual mark -> grade.manual, no reason needed");

  // admin: accounts and classes
  await as("admin");
  n = last();
  const acct = await client.call("/users", { method: "POST", body: { name: "Audit Student", email: "audit.student@westfield.edu", role: "student", classId: "cls-11a" } });
  ev = since(n); assert(ev.length === 1 && ev[0].type === "user.create" && ev[0].actor.role === "admin" && ev[0].entity.id === acct.id && ev[0].after.role === "student", "create account -> user.create");
  n = last(); await client.call(`/users/${acct.id}`, { method: "PUT", body: { active: false } });
  ev = since(n); assert(ev.length === 1 && ev[0].type === "user.update" && ev[0].before.active === true && ev[0].after.active === false, "deactivate -> user.update with before/after");
  n = last(); await client.call(`/users/${acct.id}`, { method: "PUT", body: { active: false } });
  assert(since(n).length === 0, "a no-op update logs nothing");
  n = last(); e = await code(() => login({ email: "audit.student@westfield.edu", password: "x" }));
  ev = since(n); assert(e?.status === 403 && ev.length === 1 && ev[0].type === "auth.login_failed" && ev[0].meta.code === "ACCOUNT_DISABLED" && ev[0].actor.id === null, "sign-in to a deactivated account -> auth.login_failed");
  assert(!JSON.stringify(ev).includes('"password"'), "failed sign-in event never stores a password");
  client.setAuthToken(null); await as("admin");
  n = last(); await client.call(`/users/${acct.id}`, { method: "DELETE" });
  assert(since(n).length === 1 && since(n)[0].type === "user.delete" && since(n)[0].before.role === "student", "delete account -> user.delete");
  n = last(); const kls = await client.call("/classes", { method: "POST", body: { name: "Audit Class", teacherIds: [] } });
  assert(since(n)[0]?.type === "class.create" && since(n)[0].classId === kls.id, "create class -> class.create");
  n = last(); await client.call(`/classes/${kls.id}`, { method: "PUT", body: { name: "Audit Class 2" } });
  ev = since(n); assert(ev.length === 1 && ev[0].type === "class.update" && ev[0].before.name === "Audit Class" && ev[0].after.name === "Audit Class 2", "rename class -> class.update");
  n = last(); await client.call(`/classes/${kls.id}`, { method: "DELETE" });
  assert(since(n)[0]?.type === "class.delete", "delete class -> class.delete");

  // whole chain still verifies after all of the above
  assert(AU.verifyChain(db().auditLog).ok, "after all handlers: the chain verifies");

  // nothing audit-related reaches students or teachers
  await as("student");
  const studentView = JSON.stringify([await get("/attempts"), await get(`/attempts/${att.id}/review`), await get("/tests")]);
  assert(!/answerDigest|auditLog|aiMarks|prevHash|"history"/.test(studentView), "student payloads carry no audit data, history or AI marks");
  await as("teacher");
  const teacherView = JSON.stringify([await get("/tests"), await get("/grading/queue")]);
  assert(!/answerDigest|auditLog|prevHash|"history"/.test(teacherView), "teacher payloads carry no audit chain data");
}

// ── F11b: admin audit endpoints + grading trail (lib/auditTrail, GET /audit/*) ──
{
  const { resetMockData } = await import("@/mocks/db");
  const AU = await import("@/lib/audit");
  const TR = await import("@/lib/auditTrail");
  resetMockData();

  assert(TR.confidenceBand(null) === null && TR.confidenceBand(0.59) === "low" && TR.confidenceBand(0.6) === "med" && TR.confidenceBand(0.79) === "med" && TR.confidenceBand(0.8) === "high", "confidenceBand: same buckets as the queue");

  const tchr = await as("teacher");
  const queue = (await get("/grading/queue")).filter((i) => /^Kinematics/.test(i.test) && /Quiz$/.test(i.test));
  const a = queue.find((i) => i.student === "Priya Nair");
  const to = a.aiScore >= 0.5 * a.maxScore ? 0 : a.maxScore;
  await G.reviewGrade(a.attemptId, a.questionId, { marks: to, final: true, reason: "Recheck against the model answer" });
  const b = queue.find((i) => i.student === "Maya Okafor");
  await G.approveGrades([{ attemptId: b.attemptId, questionId: b.questionId }]);

  // access
  e = await code(() => get("/audit/tests")); assert(e?.status === 403, "audit list: teacher -> 403");
  e = await code(() => get(`/audit/tests/${a.testId}`)); assert(e?.status === 403, "audit trail: teacher -> 403");
  await as("student");
  e = await code(() => get("/audit/tests")); assert(e?.status === 403, "audit list: student -> 403");
  e = await code(() => get(`/audit/tests/${a.testId}`)); assert(e?.status === 403, "audit trail: student -> 403");

  // list
  const admin = await as("admin");
  const list = await get("/audit/tests");
  const k = list.find((t) => t.testId === a.testId);
  assert(list.length >= 6 && list.every((t) => t.publishedAt === undefined && "answers" in t && "teacher" in t), "list: every published test with its counts");
  assert(k.answers === 18 && k.overridden === 1 && k.pending === 16 && k.afterRelease === 0 && k.attempts === 6 && /Chen/.test(k.teacher), "list: Kinematics Quiz counts (18 written, 1 overridden, 16 awaiting) and its teachers");
  assert(!list.some((t) => t.status === "draft"), "list: drafts never appear");

  // trail
  let n = db().auditLog.length;
  const trail = await get(`/audit/tests/${a.testId}`);
  let ev = db().auditLog.slice(n);
  assert(ev.length === 1 && ev[0].type === "audit.view" && ev[0].actor.id === admin.id && ev[0].entity.id === a.testId && ev[0].testId === a.testId && ev[0].meta.what === "test-trail", "opening a trail is itself logged (audit.view)");
  assert(trail.rows.length === 18 && trail.totals.answers === 18 && trail.nextCursor === null && trail.test.settings.aiGrading === true, "trail: 18 written answers, test settings included");
  assert(trail.rows.every((r) => r.max > 0 && r.ai && r.ai.model && r.studentAnswer !== undefined) && [...trail.rows].map((r) => r.student.name).join("|") === trail.rows.map((r) => r.student.name).sort((x, y) => x.localeCompare(y)).join("|"), "trail: AI info on every row, sorted by student");
  const r1 = trail.rows.find((r) => r.attemptId === a.attemptId && r.questionId === a.questionId);
  assert(r1.studentAnswer === a.answer && r1.ai.marks === a.aiScore && r1.final.marks === to && r1.final.status === "final" && r1.final.byName === tchr.name && r1.delta === to - a.aiScore && r1.changed && r1.overridden && !r1.afterRelease && !r1.pending, "overridden row: answer, AI mark, final mark, who, delta");
  assert(r1.history.map((h) => h.type).join() === "grade.ai_draft,grade.override" && r1.history[1].reason === "Recheck against the model answer" && r1.history[1].beforeMarks === a.aiScore && r1.history[1].afterMarks === to && r1.history[0].actorRole === "system", "overridden row: history lists the AI draft then the override with its reason");
  const r2 = trail.rows.find((r) => r.attemptId === b.attemptId && r.questionId === b.questionId);
  assert(r2.history.map((h) => h.type).join() === "grade.ai_draft,grade.approve" && r2.delta === 0 && !r2.changed && !r2.overridden && r2.final.byName === tchr.name, "approved row: matches the AI, confirmed by the teacher");
  const waiting = trail.rows.filter((r) => r.pending);
  assert(waiting.length === 16 && waiting.every((r) => r.delta === null && r.final.byName === null && r.history.length === 1), "awaiting rows: AI draft only, no delta, nobody confirmed yet");

  // paging
  n = db().auditLog.length;
  const p1 = await get(`/audit/tests/${a.testId}?limit=5`);
  const p2 = await get(`/audit/tests/${a.testId}?limit=5&cursor=${p1.nextCursor}`);
  const p4 = await get(`/audit/tests/${a.testId}?limit=5&cursor=15`);
  assert(p1.rows.length === 5 && p1.nextCursor === "5" && p2.rows.length === 5 && p2.nextCursor === "10" && p4.rows.length === 3 && p4.nextCursor === null && p2.rows[0].id === trail.rows[5].id, "paging: limit + cursor walk the rows in order");
  assert(db().auditLog.slice(n).filter((x) => x.type === "audit.view").length === 1, "paging: only the first page is logged");
  e = await code(() => get("/audit/tests/nope")); assert(e?.status === 404, "unknown test -> 404");

  // filters
  const F = (filter, query = "") => TR.filterTrailRows(trail.rows, { filter, query });
  assert(F("all").length === 18 && F("overridden").length === 1 && F("changed").length === 1 && F("pending").length === 16 && F("afterRelease").length === 0, "filters: counts per chip");
  assert(F("all", "priya").length === 3 && F("all", "  PRIYA ").length === 3 && F("all", a.question.slice(0, 12)).length >= 1 && F("pending", "priya").length === 2, "filters: search by student or question, combined with a chip");

  // a change after release is flagged everywhere
  await as("teacher");
  const nudge = to > 0 ? to - 1 : to + 1;
  e = await code(() => G.reviewGrade(a.attemptId, a.questionId, { marks: nudge, final: true }));
  assert(e?.code === "REASON_REQUIRED", "the test has closed, so changing a final mark needs a reason");
  await G.reviewGrade(a.attemptId, a.questionId, { marks: nudge, final: true, reason: "Parent query" });
  await as("admin");
  const trail2 = await get(`/audit/tests/${a.testId}`);
  const r3 = trail2.rows.find((r) => r.id === r1.id);
  assert(r3.afterRelease && r3.history.length === 3 && r3.history[2].afterRelease === true && r3.final.marks === nudge && trail2.totals.afterRelease === 1, "after-release change: row flagged, totals count it");
  assert((await get("/audit/tests")).find((t) => t.testId === a.testId).afterRelease === 1, "list: after-release count follows");
  assert(TR.filterTrailRows(trail2.rows, { filter: "afterRelease" }).length === 1, "filter: after release finds it");
  assert(AU.verifyChain(db().auditLog).ok, "chain still verifies after reads and writes");
  const trailJson = JSON.stringify(trail2);
  assert(!/prevHash|"hash"|answerDigest/.test(trailJson), "trail payload carries no hash-chain internals");
}

// ── F11c: teacher fairness signals + endpoints (lib/auditSignals, GET /audit/teachers) ──
{
  const { resetMockData } = await import("@/mocks/db");
  const AU = await import("@/lib/audit");
  const SG = await import("@/lib/auditSignals");
  const TR = await import("@/lib/auditTrail");
  const asUser = async (email) => { const r = await login({ email, password: "x" }); client.setAuthToken(r.token); return r.user; };

  // ---- pure signal rules on hand-made events ----
  let seqNo = 0;
  const A = { id: "t-a", role: "teacher", name: "Teacher A" };
  const B = { id: "t-b", role: "teacher", name: "Teacher B" };
  const ov = (actor, { student = "s1", before = 2, after = 3, conf = 0.5, max = 4, key, rel = false } = {}) => ({ seq: ++seqNo, type: "grade.override", actor, entity: { type: "grade", id: key ?? `a${seqNo}:q` }, studentId: student, testId: "tt", before: { marks: before }, after: { marks: after }, meta: { confidence: conf, max, afterRelease: rel } });
  const ap = (actor, extra = {}) => ({ seq: ++seqNo, type: "grade.approve", actor, entity: { type: "grade", id: extra.key ?? `a${seqNo}:q` }, studentId: "s9", testId: "tt", before: { marks: 2 }, after: { marks: 2 }, meta: { bulk: extra.batch ? true : false, batchId: extra.batch ?? null, afterRelease: false } });
  const codes = (events, id = "t-a") => SG.computeSignals({ events, users: [], teacherId: id }).map((x) => x.code);
  const many = (n, fn) => Array.from({ length: n }, fn);

  // rate: A changes 3 of 10, B changes 1 of 10 -> 30% vs 10%: fires (>= 2x and >= 25%)
  let ev = [...many(3, () => ov(A, { student: `x${seqNo}` })), ...many(7, () => ap(A)), ...many(1, () => ov(B)), ...many(9, () => ap(B))];
  assert(codes(ev).includes("OVERRIDE_RATE_HIGH") && !codes(ev, "t-b").includes("OVERRIDE_RATE_HIGH"), "rate: 30% vs peers' 10% fires, the peer does not");
  ev = [...many(2, () => ov(A, { student: `x${seqNo}` })), ...many(8, () => ap(A)), ...many(0, () => ov(B)), ...many(10, () => ap(B))];
  assert(!codes(ev).includes("OVERRIDE_RATE_HIGH"), "rate: 20% vs 0% stays under the 25% floor");
  ev = [...many(3, () => ov(A, { student: `x${seqNo}` })), ...many(1, () => ap(A))];
  assert(!codes(ev).includes("OVERRIDE_RATE_HIGH"), "rate: nobody to compare with -> not computed");
  ev = [...many(3, () => ov(A, { student: `x${seqNo}` })), ...many(1, () => ap(A)), ...many(10, () => ap(B))];
  assert(!codes(ev).includes("OVERRIDE_RATE_HIGH"), "rate: fewer than 5 reviewed answers -> not computed");

  // direction
  ev = [...many(4, () => ov(A, { student: `u${seqNo}` })), ov(A, { before: 3, after: 2, student: "d1" })];
  assert(codes(ev).includes("OVERRIDE_DIRECTION_BIAS"), "direction: 4 of 5 up (80%) fires");
  ev = [...many(3, () => ov(A, { student: `u${seqNo}` })), ...many(2, () => ov(A, { before: 3, after: 2, student: `d${seqNo}` }))];
  assert(!codes(ev).includes("OVERRIDE_DIRECTION_BIAS"), "direction: 3 up / 2 down does not");
  ev = many(4, () => ov(A, { student: `u${seqNo}` }));
  assert(!codes(ev).includes("OVERRIDE_DIRECTION_BIAS"), "direction: needs at least 5 changes");

  // favouritism
  ev = [...many(3, () => ov(A, { student: "fav" })), ...many(3, () => ov(A, { student: `o${seqNo}` }))];
  const fav = SG.computeSignals({ events: ev, users: [], teacherId: "t-a" }).find((x) => x.code === "STUDENT_FAVOURITISM");
  assert(fav && fav.studentId === "fav" && fav.evidence.length === 3, "favourite: 3 increases = 50% of all fires, with its evidence");
  ev = [...many(3, () => ov(A, { student: "fav" })), ...many(5, () => ov(A, { student: `o${seqNo}` }))];
  assert(!codes(ev).includes("STUDENT_FAVOURITISM"), "favourite: 3 of 8 (37.5%) does not");
  ev = [...many(2, () => ov(A, { student: "fav" })), ov(A, { student: "o1" })];
  assert(!codes(ev).includes("STUDENT_FAVOURITISM"), "favourite: needs 3 increases for the same student");

  // confident AI
  assert(codes([ov(A, { conf: 0.85, before: 2, after: 3, max: 4 })]).includes("OVERRIDE_AGAINST_CONFIDENT_AI"), "confident AI: 85% sure and a 25% move fires");
  assert(!codes([ov(A, { conf: 0.84, before: 2, after: 3, max: 4 })]).includes("OVERRIDE_AGAINST_CONFIDENT_AI") && !codes([ov(A, { conf: 0.9, before: 3, after: 3.5, max: 4 })]).includes("OVERRIDE_AGAINST_CONFIDENT_AI"), "confident AI: 84% sure, or a small move, does not");
  const noMax = ov(A, { conf: 0.9 }); delete noMax.meta.max;
  assert(!codes([noMax]).includes("OVERRIDE_AGAINST_CONFIDENT_AI"), "confident AI: events without max are skipped");

  // after release / edits / bulk
  const lateSig = SG.computeSignals({ events: [ov(A, { rel: true })], users: [], teacherId: "t-a" }).find((x) => x.code === "AFTER_RELEASE_CHANGE");
  assert(lateSig && lateSig.severity === "high" && lateSig.evidence.length === 1, "after release: one change is enough, severity high");
  const upd = (changed, afterAttempts) => ({ seq: ++seqNo, type: "test.update", actor: A, entity: { type: "test", id: "tt" }, testId: "tt", meta: { changed, afterAttempts } });
  assert(codes([upd(["questions"], true)]).includes("EDIT_AFTER_ATTEMPTS") && codes([upd(["settings"], true)]).includes("EDIT_AFTER_ATTEMPTS"), "edit after attempts: questions or settings fires");
  assert(!codes([upd(["title"], true)]).includes("EDIT_AFTER_ATTEMPTS") && !codes([upd(["questions"], false)]).includes("EDIT_AFTER_ATTEMPTS"), "edit after attempts: a title change, or no attempts yet, does not");
  assert(codes(many(20, () => ap(A, { batch: "b1" }))).includes("BULK_APPROVE_LARGE") && !codes(many(19, () => ap(A, { batch: "b1" }))).includes("BULK_APPROVE_LARGE"), "bulk: 20 in one batch fires, 19 does not");
  assert(!codes([...many(12, () => ap(A, { batch: "b1" })), ...many(12, () => ap(A, { batch: "b2" }))]).includes("BULK_APPROVE_LARGE"), "bulk: two batches of 12 do not");

  // ordering, wording, stats
  const mixed = SG.computeSignals({ events: [ov(A, { rel: true }), ...many(20, () => ap(A, { batch: "b9" }))], users: [], teacherId: "t-a" });
  assert(mixed[0].severity === "high" && mixed[mixed.length - 1].severity === "low", "signals are listed most serious first");
  const allText = JSON.stringify(Object.values(SG.SIGNAL_META)) + mixed.map((x) => x.text).join(" ");
  assert(!/cheat|unfair|guilty|fraud|corrupt|favouritism by/i.test(allText), "signal wording makes no accusation");
  const st = SG.computeTeacherStats([ap(A, { key: "k1" }), ov(A, { key: "k1" }), ap(A, { key: "k2" })], [])[0];
  assert(st.reviewed === 2 && st.overrides === 1 && Math.abs(st.overrideRate - 0.5) < 1e-9, "stats: an answer approved then changed counts once");

  // ---- seeded fixture ----
  resetMockData();
  const log = db().auditLog;
  assert(AU.verifyChain(log).ok, "seed with fixture: chain verifies");
  const forces = db().tests.find((t) => /^Forces/.test(t.title)); const energy = db().tests.find((t) => /^Energy/.test(t.title));
  assert(forces && energy && db().attempts.filter((a) => a.testId === forces.id).length === 5 && db().attempts.filter((a) => a.testId === energy.id).length === 6, "fixture: Forces (10A, 5 students) and Energy (11B, 6 students)");
  const stats = SG.computeTeacherStats(log, db().users);
  const park = stats.find((x) => x.teacherId === "u-park"); const osei = stats.find((x) => x.teacherId === "u-osei");
  assert(park.reviewed === 15 && park.overrides === 7 && park.upward === 6 && park.downward === 1 && park.afterRelease === 1, "fixture: Mrs. Park reviewed 15, changed 7 (6 up, 1 down), 1 after release");
  assert(osei.reviewed === 24 && osei.overrides === 2 && osei.upward === 1 && osei.downward === 1 && !stats.some((x) => x.teacherId === "u-teacher"), "fixture: Mr. Osei reviewed 24, changed 2; Dr. Chen has not graded anything");
  const seededCodes = (id) => SG.computeSignals({ events: log, users: db().users, teacherId: id }).map((x) => x.code).sort().join();
  assert(seededCodes("u-park") === "AFTER_RELEASE_CHANGE,OVERRIDE_DIRECTION_BIAS,OVERRIDE_RATE_HIGH,STUDENT_FAVOURITISM", "fixture: Park shows four signals");
  assert(seededCodes("u-osei") === "BULK_APPROVE_LARGE" && seededCodes("u-teacher") === "", "fixture: Osei one low signal, Chen none");
  const rows = TR.buildTrailRows({ attempts: db().attempts.filter((a) => a.testId === forces.id), events: log.filter((x) => x.testId === forces.id), users: db().users });
  assert(rows.length === 15 && rows.every((r) => r.final.status === "final") && rows.filter((r) => r.overridden).length === 7 && rows.filter((r) => r.afterRelease).length === 1, "fixture: the trail agrees (15 final, 7 overridden, 1 after release)");
  assert(rows.every((r) => { const last = r.history[r.history.length - 1]; return last.type === "grade.ai_draft" || last.afterMarks === r.final.marks; }), "fixture: every row's last event matches its final mark");

  // ---- endpoints ----
  await as("teacher");
  e = await code(() => get("/audit/teachers")); assert(e?.status === 403, "teachers list: teacher -> 403");
  e = await code(() => get("/audit/teachers/u-park")); assert(e?.status === 403, "teacher profile: teacher -> 403");
  await as("student");
  e = await code(() => get("/audit/teachers")); assert(e?.status === 403, "teachers list: student -> 403");
  const adm = await as("admin");
  const tl = await get("/audit/teachers");
  const tp = tl.find((x) => x.teacherId === "u-park"); const to2 = tl.find((x) => x.teacherId === "u-osei"); const tc = tl.find((x) => x.teacherId === "u-teacher");
  assert(tl.length === 3 && tp.classes.join() === "11A,10A" && tp.reviewed === 15 && tp.signals.high === 1 && tp.signals.medium === 3 && tp.signals.low === 0, "teachers list: Park's numbers and signal counts");
  assert(to2.signals.low === 1 && to2.signals.high + to2.signals.medium === 0 && tc.reviewed === 0 && tc.signals.high + tc.signals.medium + tc.signals.low === 0 && tc.overrideRate === 0, "teachers list: Osei one low, Chen nothing");
  let n = db().auditLog.length;
  const prof = await get("/audit/teachers/u-park");
  const ev1 = db().auditLog.slice(n);
  assert(ev1.length === 1 && ev1[0].type === "audit.view" && ev1[0].actor.id === adm.id && ev1[0].meta.what === "teacher-profile" && ev1[0].entity.id === "u-park", "opening a teacher profile is logged");
  assert(prof.teacher.name === "Mrs. L. Park" && prof.stats.overrides === 7 && Math.abs(prof.peerMedianRate - 2 / 24) < 1e-9 && prof.signals.length === 4 && prof.signals[0].severity === "high", "profile: stats, peer median (Osei) and signals, most serious first");
  assert(prof.students[0].name === "Farid Khalil" && prof.students[0].upward === 3 && prof.tests.length === 1 && /^Forces/.test(prof.tests[0].title) && prof.tests[0].overrides === 7, "profile: favourite student and tests marked");
  e = await code(() => get("/audit/teachers/nobody")); assert(e?.status === 404, "unknown teacher -> 404");
  e = await code(() => get(`/audit/teachers/${db().users.find((u) => u.role === "student").id}`)); assert(e?.status === 404, "a student id is not a teacher -> 404");
  const none = await get("/audit/teachers/u-teacher");
  assert(none.stats.reviewed === 0 && none.signals.length === 0 && none.peerMedianRate !== null && none.students.length === 0, "profile: a teacher with no grading is empty, not an error");
  assert(!/prevHash|"hash"/.test(JSON.stringify([tl, prof])), "teacher payloads carry no hash-chain internals");

  // ---- grading is scoped to the teacher's own classes ----
  await as("teacher"); // Dr. Chen: 11A + 11B
  const chenQ = await get("/grading/queue");
  assert(chenQ.some((i) => /^Energy/.test(i.test)) && chenQ.some((i) => /^Kinematics/.test(i.test)) && !chenQ.some((i) => /^Forces/.test(i.test)), "queue: Dr. Chen sees 11A and 11B, not 10A");
  const forcesAttempt = db().attempts.find((a) => a.testId === forces.id); const fq = Object.keys(forcesAttempt.grades).find((id) => forcesAttempt.grades[id].aiMarks != null);
  e = await code(() => G.reviewGrade(forcesAttempt.id, fq, { marks: 0, final: true, reason: "no" })); assert(e?.status === 404, "PATCH on another teacher's class -> 404");
  const before = db().auditLog.length;
  const ghost = await G.approveGrades([{ attemptId: forcesAttempt.id, questionId: fq }]);
  assert(ghost.approved === 0 && db().auditLog.length === before, "approve on another teacher's class approves nothing and logs nothing");
  await asUser("l.park@westfield.edu");
  const parkQ = await get("/grading/queue");
  assert(parkQ.filter((i) => /^Forces/.test(i.test)).length === 15 && parkQ.some((i) => /^Kinematics/.test(i.test)) && !parkQ.some((i) => /^Energy/.test(i.test)), "queue: Mrs. Park sees 10A and 11A, not 11B");
  assert(AU.verifyChain(db().auditLog).ok, "chain verifies after the F11c checks");
}

// ── F11d: event explorer, integrity, export log, my grading history ──
{
  const { resetMockData, tamperAuditEvent } = await import("@/mocks/db");
  const AU = await import("@/lib/audit");
  const EV = await import("@/lib/auditEvents");
  const asUser = async (email) => { const r = await login({ email, password: "x" }); client.setAuthToken(r.token); return r.user; };
  resetMockData();
  const log = db().auditLog;

  // ---- pure filter / describe / csv ----
  const total0 = log.length;
  assert(EV.filterEvents(log, {}).length === total0 && EV.filterEvents(log, { actor: "", type: "", group: "" }).length === total0, "filterEvents: empty filters keep everything");
  const grading = EV.filterEvents(log, { group: "grading" });
  assert(grading.length > 0 && grading.every((x) => /^grade\./.test(x.type)), "filterEvents: group");
  const overrides = EV.filterEvents(log, { type: "grade.override" });
  assert(overrides.length === 9 && EV.filterEvents(log, { type: "grade.override", actor: "u-park" }).length === 7, "filterEvents: type and actor (Park 7 of 9 overrides)");
  assert(EV.filterEvents(log, { actor: "system" }).every((x) => x.actor.role === "system") && EV.filterEvents(log, { actor: "system" }).length > 0, "filterEvents: the system as an actor");
  const mid = log[Math.floor(total0 / 2)].at;
  assert(EV.filterEvents(log, { from: mid }).every((x) => x.at >= mid) && EV.filterEvents(log, { to: mid }).every((x) => x.at <= mid) && EV.filterEvents(log, { from: mid, to: mid }).length >= 1, "filterEvents: from/to are inclusive");
  assert(EV.filterEvents(log, { group: "grading", actor: "u-osei", type: "grade.approve" }).every((x) => x.actor.id === "u-osei" && x.type === "grade.approve"), "filterEvents: filters combine");
  const ov = overrides.find((x) => x.actor.id === "u-park");
  const names = { users: { [ov.studentId]: "Farid Khalil" }, tests: { [ov.testId]: "Forces" } };
  assert(/Farid Khalil: [\d.]+ → [\d.]+ \/ \d+ \(AI gave [\d.]+\)\. Reason: “/.test(EV.describeEvent(ov, names)), "describeEvent: override reads like a sentence with the reason");
  assert(EV.describeEvent({ type: "test.extend", testId: "t", meta: { minutes: 5 } }, { tests: { t: "Quiz" } }) === "Quiz: +5 min." && /deactivated|ACCOUNT_DISABLED/.test(EV.describeEvent({ type: "auth.login_failed", meta: { email: "a@b.c", code: "ACCOUNT_DISABLED" } })), "describeEvent: other types");
  const csv = EV.eventsToCsvRows(overrides.slice(0, 2), names);
  assert(csv.length === 2 && csv[0].length === EV.EVENT_CSV_HEADER.length && /^\d{4}-\d\d-\d\dT/.test(csv[0][1]) && csv[0][8] === overrides[0].hash, "eventsToCsvRows: one row per event, ISO time, hash included");
  assert(Object.keys(AU.AUDIT_TYPES).every((t) => EV.EVENT_GROUPS.some((g) => g.types.includes(t))), "every event type belongs to a group");

  // ---- access ----
  await as("teacher");
  for (const path of ["/audit/events", "/audit/integrity"]) { e = await code(() => get(path)); assert(e?.status === 403, `${path}: teacher -> 403`); }
  e = await code(() => client.call("/audit/export-log", { method: "POST", body: { rows: 1 } })); assert(e?.status === 403, "export-log: teacher -> 403");
  await as("student");
  e = await code(() => get("/audit/events")); assert(e?.status === 403, "events: student -> 403");
  e = await code(() => get("/audit/mine")); assert(e?.status === 403, "mine: student -> 403");
  await as("admin");
  e = await code(() => get("/audit/mine")); assert(e?.status === 403, "mine: admin -> 403");
  const tNow = db().auditLog.length; // sign-ins above added events

  // ---- events endpoint ----
  const p1 = await get("/audit/events");
  assert(p1.events.length === 50 && p1.total === tNow && p1.events[0].seq === tNow && p1.events[49].seq === tNow - 49 && p1.nextCursor === String(tNow - 49), "events: newest first, 50 per page, cursor = last seq");
  const p2 = await get(`/audit/events?cursor=${p1.nextCursor}`);
  assert(p2.events[0].seq === tNow - 50 && new Set([...p1.events, ...p2.events].map((x) => x.seq)).size === 100, "events: the next page continues without overlap");
  const all = await get("/audit/events?limit=9999");
  assert(all.events.length === Math.min(tNow, 500) && all.nextCursor === (tNow > 500 ? String(all.events[all.events.length - 1].seq) : null), "events: limit is capped at 500");
  assert(p1.facets.actors.some((a) => a.id === "u-park") && p1.facets.actors.some((a) => a.id === "system") && p1.facets.actors.every((a) => a.name), "events: facets list who appears in the log");
  const withStudent = all.events.find((x) => x.studentId);
  assert(all.names.users[withStudent.studentId] && Object.keys(all.names.tests).length > 3, "events: names resolve students and tests");
  const forces = db().tests.find((t) => /^Forces/.test(t.title));
  const byTest = await get(`/audit/events?testId=${forces.id}&limit=500`);
  assert(byTest.total === EV.filterEvents(log, { testId: forces.id }).length && byTest.events.every((x) => x.testId === forces.id), "events: filter by test");
  const combo = await get(`/audit/events?group=grading&actor=u-park&limit=500`);
  assert(combo.total === EV.filterEvents(log, { group: "grading", actor: "u-park" }).length && combo.events.every((x) => x.actor.id === "u-park" && /^grade\./.test(x.type)), "events: filters combine over the API");
  const ranged = await get(`/audit/events?from=${encodeURIComponent(mid)}&limit=500`);
  assert(ranged.events.every((x) => new Date(x.at).toISOString() >= mid) && ranged.total === EV.filterEvents(log, { from: mid }).length, "events: date filter over the API");

  // ---- integrity ----
  const ok1 = await get("/audit/integrity");
  assert(ok1.ok === true && ok1.checked === tNow && ok1.total === tNow && ok1.lastSeq === tNow && ok1.headHash === log[tNow - 1].hash && ok1.verifiedAt, "integrity: intact chain reports count and head fingerprint");
  assert(tamperAuditEvent(7) === 7 && tamperAuditEvent(99999) === null, "tamper demo helper edits one event, ignores unknown ones");
  const bad = await get("/audit/integrity");
  assert(bad.ok === false && bad.badSeq === 7 && bad.reason === "hash" && bad.total === tNow, "integrity: an edited event is caught, with its number");
  resetMockData(); await as("admin");
  assert((await get("/audit/integrity")).ok === true, "integrity: a reset restores a clean record");

  // ---- export log ----
  let n = db().auditLog.length;
  const nothing = await client.call("/audit/export-log", { method: "POST", body: { rows: 12 } });
  const ex = db().auditLog.slice(n);
  assert(nothing === null && ex.length === 1 && ex[0].type === "audit.export" && ex[0].actor.role === "admin" && ex[0].meta.rows === 12, "export-log: records who exported how many rows");
  e = await code(() => client.call("/audit/export-log", { method: "POST", body: { rows: -1 } })); assert(e?.status === 400, "export-log: rejects a bad row count");
  assert(db().auditLog.length === n + 1, "export-log: a rejected call writes nothing");

  // ---- my grading history ----
  await asUser("l.park@westfield.edu");
  n = db().auditLog.length;
  const mine = await get("/audit/mine?limit=500");
  assert(db().auditLog.length === n, "reading my own history writes nothing");
  assert(mine.totals.reviewed === 15 && mine.totals.overrides === 7 && mine.totals.upward === 6 && mine.totals.downward === 1 && mine.totals.afterRelease === 1, "mine: Park sees her own totals");
  const parkSeqs = new Set(db().auditLog.filter((x) => x.actor.id === "u-park" && /^(grade|test)\./.test(x.type)).map((x) => x.seq));
  assert(mine.items.length === parkSeqs.size && mine.items.every((i) => parkSeqs.has(i.seq)), "mine: only her own grade/test events, nobody else's");
  const mo = mine.items.find((i) => i.type === "grade.override");
  assert(mo.studentName && mo.testTitle && mo.reason && mo.afterMarks != null && mo.max > 0 && mine.items.some((i) => i.afterRelease), "mine: override rows carry student, test, marks and reason; the late change is flagged");
  assert(mine.items[0].seq > mine.items[mine.items.length - 1].seq && !/prevHash|"hash"|actor/.test(JSON.stringify(mine)), "mine: newest first, no chain internals or actor data");
  const m1 = await get("/audit/mine?limit=5"); const m2 = await get(`/audit/mine?limit=5&cursor=${m1.nextCursor}`);
  assert(m1.items.length === 5 && m1.nextCursor && m2.items[0].seq < m1.items[4].seq, "mine: pages with a cursor");
  await as("teacher");
  const chen = await get("/audit/mine");
  assert(chen.totals.reviewed === 0 && chen.items.every((i) => i.type.startsWith("test.")), "mine: Dr. Chen has graded nothing, only test events");
  assert(AU.verifyChain(db().auditLog).ok, "chain verifies after the F11d checks");
}


// ── F13a: initials, avatar tone, profile rules, GET/PATCH /profile ──
{
  const I = await import("@/lib/initials");
  const P = await import("@/lib/profile");
  const AU = await import("@/lib/audit");
  const { resetMockData } = await import("@/mocks/db");
  const { resolvePath } = await import("@/routes/paths");
  resetMockData();

  const table = [["Dr. R. Chen","RC"],["Dr Chen","C"],["Mrs. Aisha Khan","AK"],["Prof. Ali Raza Shah","AS"],["Maya Okafor","MO"],["Anna Maria Lopez","AL"],["Madonna","M"],["  maya   okafor ","MO"],["","?"],[null,"?"],["Dr.","?"],["... ---","?"],["Ahmed-Ali Khan","AK"],["علی رضا","عر"],["ڈاکٹر","ڈ"]];
  for (const [name, want] of table) assert(I.initialsOf(name) === want, `initialsOf(${JSON.stringify(name)}) = ${want}`);
  const tones = ["Maya Okafor","Dr. R. Chen","S. Whitfield","Ayesha","علی رضا",""].map(I.avatarToneIndex);
  assert(tones.every((t) => Number.isInteger(t) && t >= 0 && t < 6) && I.AVATAR_TONES.length === 6, "avatarTone: six tones, index always in range");
  assert(I.avatarToneIndex("Maya Okafor") === I.avatarToneIndex(" maya okafor ") && I.avatarTone("Maya Okafor") === I.AVATAR_TONES[I.avatarToneIndex("Maya Okafor")], "avatarTone: stable for the same person (case and spacing ignored)");
  assert(new Set(["Maya Okafor","Dr. R. Chen","S. Whitfield","Liam Park","Noor Fatima","Ali Raza","Sara Khan","Omar Farooq"].map(I.avatarToneIndex)).size >= 3, "avatarTone: different people spread over several tones");
  assert(new Set(I.AVATAR_TONES).size === 6 && I.AVATAR_TONES.every((t) => !/danger/.test(t)), "avatarTone: tones are distinct and none is red");

  // pure rules
  const v = (p, after) => P.validateProfilePatch(p, after);
  assert(v({ bio: "Hi", phone: "+92 300-1234567" }) === null && v({ bio: "", phone: "" }) === null, "profile rules: valid and empty values pass");
  assert(v({ bio: "x".repeat(200) }) === null && v({ bio: "x".repeat(201) }).bio, "profile rules: bio up to 200");
  assert(v({ phone: "0".repeat(20) }) === null && v({ phone: "0".repeat(21) }).phone && v({ phone: "03001234abc" }).phone && v({ phone: "(0300)" }).phone, "profile rules: phone ≤20 of digits + space dash");
  assert(v({ name: "Eve" })._ && v({ email: "a@b.c" })._ && v({ role: "admin" })._ && v({})._ && v(null)._, "profile rules: identity fields and empty bodies are refused");
  assert(v({ prefs: [] }).prefs && v({ prefs: null }).prefs && v({ prefs: "x" }).prefs && v({ prefs: { a: 1 } }) === null, "profile rules: prefs must be an object");
  assert(v({ prefs: { a: "x".repeat(3000) } }).prefs && v({ prefs: { a: 1 } }, { a: "x".repeat(3000) }).prefs, "profile rules: prefs ≤ 2 KB (checked on the merged result)");
  assert(JSON.stringify(P.mergePrefs({ a: 1, b: 2 }, { b: null, c: 3 })) === '{"a":1,"c":3}' && JSON.stringify(P.mergePrefs(undefined, { a: 1 })) === '{"a":1}', "profile rules: prefs merge by key, null removes");
  assert(["admin","teacher","student"].every((r) => resolvePath(r, "profile") === `/${r}/profile`), "profile route exists per role");

  // GET /profile per role
  const stu = await as("student");
  let me = await get("/profile");
  const sd = db().users.find((u) => u.id === stu.id);
  assert(me.id === stu.id && me.role === "student" && me.email === stu.email && me.rollNo === sd.roll && me.classes.length === 1 && me.classes[0].code === stu.cls, "profile: student gets own identity, roll number and class");
  assert(me.bio === "" && me.phone === "" && me.photoUrl === null && JSON.stringify(me.prefs) === "{}" && me.subjects.length > 0 && me.subjects.every((s) => s.classId === stu.classId), "profile: defaults when nothing is set; subjects are the class's");
  assert(!/"(password\w*|token|guardian\w*)"/i.test(Object.keys(me).map((k) => `"${k}"`).join()) || Object.keys(me).filter((k) => /password|token|guardian/i.test(k)).join() === "passwordChangedAt", "profile: no password, token or parent contact in the payload (only the change date)");
  const tea = await as("teacher");
  const tp = await get("/profile");
  assert(tp.role === "teacher" && tp.rollNo === undefined && tp.classes.length > 0 && tp.subjects.length > 0, "profile: teacher gets own classes and subjects, no roll number");
  await as("admin");
  const ap = await get("/profile");
  assert(ap.role === "admin" && ap.classes.length === 0 && ap.subjects.length === 0, "profile: admin has no classes or subjects");
  client.setAuthToken(null);
  e = await code(() => get("/profile")); assert(e?.status === 401, "profile: signed out → 401");

  // PATCH /profile
  await as("student");
  const n0 = db().auditLog.length;
  me = await client.call("/profile", { method: "PATCH", body: { bio: "  Loves physics  ", phone: " 0300-1234567 " } });
  assert(me.bio === "Loves physics" && me.phone === "0300-1234567" && (await get("/profile")).bio === "Loves physics", "PATCH: saved trimmed, and read back");
  assert(sd.bio === "Loves physics" && sd.phone === "0300-1234567", "PATCH: stored on the user record");
  const evs = db().auditLog.slice(n0);
  assert(evs.length === 1 && evs[0].type === "profile.update" && evs[0].actor.id === stu.id && evs[0].entity.id === stu.id && JSON.stringify(evs[0].meta.changed) === '["bio","phone"]', "PATCH: one profile.update event with the changed field names");
  assert(!/physics|1234567/.test(JSON.stringify(evs[0])), "PATCH: the event never contains the values");
  await client.call("/profile", { method: "PATCH", body: { bio: "Loves physics" } });
  assert(db().auditLog.length === n0 + 1, "PATCH: saving an unchanged value writes no event");
  await client.call("/profile", { method: "PATCH", body: { phone: "" } });
  const evs2 = db().auditLog.slice(n0 + 1);
  assert(evs2.length === 1 && JSON.stringify(evs2[0].meta.changed) === '["phone"]' && (await get("/profile")).phone === "", "PATCH: clearing a field is a change");
  await client.call("/profile", { method: "PATCH", body: { prefs: { a: 1, b: 2 } } });
  me = await client.call("/profile", { method: "PATCH", body: { prefs: { b: null, c: 3 } } });
  assert(JSON.stringify(me.prefs) === '{"a":1,"c":3}' && db().auditLog.at(-1).meta.changed.join() === "prefs", "PATCH: prefs merge by key; the event names `prefs`, not its content");
  for (const [body, label] of [[{ bio: "x".repeat(201) }, "long bio"], [{ phone: "abc" }, "letters in phone"], [{ name: "Eve" }, "name"], [{ email: "e@x.com" }, "email"], [{ role: "admin" }, "role"], [{ roll: 1 }, "roll number"], [{}, "empty body"], [{ prefs: { a: "x".repeat(3000) } }, "big prefs"], [{ prefs: [] }, "array prefs"]]) {
    const before = db().auditLog.length;
    e = await code(() => client.call("/profile", { method: "PATCH", body }));
    assert(e?.status === 400 && e.code === "INVALID_PROFILE" && db().auditLog.length === before, `PATCH refuses ${label} (400 INVALID_PROFILE, nothing logged)`);
  }
  assert(sd.name === stu.name && sd.email === stu.email && sd.role === "student", "PATCH: identity fields are untouched after the refusals");
  const teaBefore = JSON.stringify(db().users.find((u) => u.id === tea.id).bio ?? null);
  await as("teacher");
  await client.call("/profile", { method: "PATCH", body: { bio: "Physics, 11A and 10B" } });
  assert((await get("/profile")).bio === "Physics, 11A and 10B" && db().users.find((u) => u.id === stu.id).bio === "Loves physics" && teaBefore === "null", "PATCH: changes only the caller's own record");
  await as("student");
  assert((await get("/profile")).bio === "Loves physics", "PATCH: the student still sees their own bio, not the teacher's");

  // previous sign-in
  resetMockData();
  await as("teacher"); await as("teacher");
  const t2 = await get("/profile");
  const myLogins = db().auditLog.filter((x) => x.type === "auth.login" && x.actor.id === tea.id);
  assert(typeof t2.previousLoginAt === "number" && t2.previousLoginAt === Date.parse(myLogins.at(-2).at), "profile: previousLoginAt is the sign-in before this one (adapted to ms)");
  const rawProfile = await (await fetch(client.BASE_URL + "/profile", { headers: { Authorization: `Bearer mock.${tea.id}` } })).json();
  assert(rawProfile._id === tea.id && /T.*Z$/.test(rawProfile.previousLoginAt ?? "2000-01-01T00:00:00Z"), "profile wire: _id + ISO date");
  assert(AU.verifyChain(db().auditLog).ok && AU.AUDIT_TYPES["profile.update"], "chain verifies after the F13a checks; profile.update has a label");
}

// ── F13b: password rules, temporary passwords, change/reset flows, forced change ──
{
  const PW = await import("@/lib/password");
  const AU = await import("@/lib/audit");
  const EV = await import("@/lib/auditEvents");
  const { resetMockData } = await import("@/mocks/db");
  const { changePassword } = await import("@/api/auth");
  const { createUser, resetPassword } = await import("@/api/admin");
  resetMockData();

  const ctx = { email: "maya.okafor@westfield.edu", current: "old-password-here-1" };
  const v = (p, c = ctx) => PW.validatePassword(p, c);
  assert(PW.PASSWORD_MIN_LENGTH === 15 && PW.PASSWORD_MAX_LENGTH === 128, "password: NIST 800-63B-4 floor of 15 (single-factor), ceiling 128");
  assert(v("short") === "TOO_SHORT" && v("a".repeat(13) + "!") === "TOO_SHORT" && v("a1".repeat(7) + "b") === null && v("") === "TOO_SHORT" && v(null) === "TOO_SHORT", "password: under 15 characters → TOO_SHORT");
  assert(v("purple tractor sings quietly") === null && v("mango-river-lantern-42") === null, "password: passphrases with spaces or dashes pass; no digit/symbol rule");
  assert(v("alllowercaseletters") === null && v("ALLUPPERCASELETTERS") === null, "password: no composition rules (all lower / all upper pass)");
  assert(v("x".repeat(129)) === "TOO_LONG" && v("y".repeat(128) + "") !== "TOO_LONG" && v("🙂😀😃😄😁😆😅😂🤣😊😇🙃😉😌😍") === null && v("🙂".repeat(15)) === "TOO_COMMON", "password: 128 allowed, 129 TOO_LONG; length counts characters, not UTF-16 units");
  assert(v("old-password-here-1") === "SAME_AS_CURRENT" && v("old-password-here-2") === null && PW.validatePassword("old-password-here-1", { email: ctx.email }) === null, "password: SAME_AS_CURRENT only when a current password is given");
  assert(v("my maya.okafor@westfield.edu login") === "CONTAINS_EMAIL" && v("the-maya.okafor-secret-1") === "CONTAINS_EMAIL" && v("MAYA.OKAFOR is my name!") === "CONTAINS_EMAIL" && v("some totally unrelated words") === null, "password: CONTAINS_EMAIL (full address or the part before @, any case)");
  assert(v("a@b.co plus other words ok") === null, "password: a very short email name is not a ban word");
  assert(v("passwordpassword") === "TOO_COMMON" && v("Password Password") === "TOO_COMMON" && v("aaaaaaaaaaaaaaaa") === "TOO_COMMON" && v("abcdabcdabcdabcd") === "TOO_COMMON" && v("westfield school") === "TOO_COMMON", "password: TOO_COMMON (blocklist on the whole password, repeats)");
  assert(v("correct horse battery staple") === null && v("a horse walked past the old fence") === null, "password: a blocklist word INSIDE a longer passphrase is fine (whole-password match only)");
  assert(v("short", { email: "maya.okafor@westfield.edu", current: "short" }) === "TOO_SHORT", "password: first failing rule wins (length first)");
  const ch = PW.passwordChecks("", ctx);
  assert(ch.length === 4 && ch.every((c) => c.ok === false && c.code && c.text), "passwordChecks: empty field shows nothing as met");
  const ch2 = PW.passwordChecks("purple tractor sings quietly", ctx);
  assert(ch2.every((c) => c.ok), "passwordChecks: all met for a good passphrase");
  const ch3 = PW.passwordChecks("short", ctx);
  assert(!ch3.find((c) => c.code === "TOO_SHORT").ok && ch3.find((c) => c.code === "CONTAINS_EMAIL").ok, "passwordChecks: reports each rule separately");
  const tmp = Array.from({ length: 200 }, () => PW.generateTemporaryPassword());
  assert(tmp.every((t) => /^[abcdefghjkmnpqrstuvwxyz23456789]{4}(-[abcdefghjkmnpqrstuvwxyz23456789]{4}){3}$/.test(t)) && new Set(tmp).size === 200, "temporary password: 4×4 characters, no look-alikes, never repeats");
  assert(PW.generateTemporaryPassword((n) => Uint8Array.from({ length: n }, (_, i) => (i % 2 ? 250 : 0))) === "aaaa-aaaa-aaaa-aaaa", "temporary password: bytes ≥ 248 are rejected (no modulo bias)");
  assert(tmp.every((t) => PW.validatePassword(t, { email: "x@y.z" }) === null), "temporary password: itself satisfies the rules");

  // ---- admin creates an account: temp password once ----
  await as("admin");
  const classes = await get("/classes");
  const made = await createUser({ name: "Zara Ahmed", email: "zara.ahmed@westfield.edu", role: "student", classId: classes[0].id });
  assert(/^\w{4}(-\w{4}){3}$/.test(made.temporaryPassword) && made.mustChangePassword === true && made.role === "student" && made.id, "create: response has a temporary password and mustChangePassword");
  const listed = (await get("/users")).find((u) => u.id === made.id);
  assert(listed.mustChangePassword === true && !("temporaryPassword" in listed) && !JSON.stringify(await get("/users")).includes(made.temporaryPassword), "create: the temporary password is in the create response only");
  assert(!JSON.stringify(db()).includes(made.temporaryPassword), "create: the mock never stores the password anywhere");
  assert(!JSON.stringify(db().auditLog).includes(made.temporaryPassword) && db().auditLog.at(-1).type === "user.create", "create: not in the audit log either");
  const seededT = (await get("/users")).find((u) => u.role === "teacher");
  assert(seededT.mustChangePassword === false, "seeded accounts don't have to change their password");

  // ---- reset ----
  const n0 = db().auditLog.length;
  const reset = await resetPassword(seededT.id);
  assert(/^\w{4}(-\w{4}){3}$/.test(reset.temporaryPassword) && reset.temporaryPassword !== made.temporaryPassword, "reset: returns a fresh temporary password");
  const evs = db().auditLog.slice(n0);
  assert(evs.length === 1 && evs[0].type === "auth.password_reset" && evs[0].actor.role === "admin" && evs[0].entity.id === seededT.id && !JSON.stringify(evs[0]).includes(reset.temporaryPassword), "reset: one event naming the admin and the account, never the password");
  assert((await get("/users")).find((u) => u.id === seededT.id).mustChangePassword === true && !JSON.stringify(db()).includes(reset.temporaryPassword), "reset: account must change password; password not stored");
  e = await code(() => resetPassword("nope")); assert(e?.status === 404, "reset: unknown account → 404");
  db().users.find((u) => u.role === "admin") && (e = await code(() => resetPassword(db().users.find((u) => u.role === "admin").id)));
  assert(e?.status === 409 && e.code === "CANNOT_CHANGE_ADMIN", "reset: an administrator can't be reset here");
  await as("teacher"); e = await code(() => resetPassword(made.id)); assert(e?.status === 403, "reset: teacher → 403");
  await as("student"); e = await code(() => resetPassword(made.id)); assert(e?.status === 403, "reset: student → 403");
  e = await code(() => createUser({ name: "X Y", email: "x.y@westfield.edu", role: "teacher" })); assert(e?.status === 403, "create: student can't create accounts");

  // ---- forced change, then change ----
  client.setAuthToken(null);
  const s = await login({ email: "zara.ahmed@westfield.edu", password: "whatever", role: "student" });
  client.setAuthToken(s.token);
  assert(s.user.id === made.id && s.user.mustChangePassword === true && (await fetchMe()).mustChangePassword === true, "sign-in: user and /auth/me carry mustChangePassword");
  const before = db().auditLog.length;
  const bad = [[{ current: "", next: "purple tractor sings quietly" }, 400, "INVALID_INPUT"], [{ current: "x" }, 400, "INVALID_INPUT"], [{ current: "tmp", next: "short" }, 400, "TOO_SHORT"], [{ current: "y".repeat(20), next: "x".repeat(20) }, 400, "TOO_COMMON"], [{ current: "tmp-tmp-tmp-tmp-1", next: "tmp-tmp-tmp-tmp-1" }, 400, "SAME_AS_CURRENT"], [{ current: "tmp", next: "zara.ahmed is my login name" }, 400, "CONTAINS_EMAIL"], [{ current: "tmp", next: "z".repeat(129) }, 400, "TOO_LONG"], [{ current: "tmp", next: "passwordpassword" }, 400, "TOO_COMMON"]];
  for (const [body, status, c] of bad) { e = await code(() => changePassword(body)); assert(e?.status === status && e.code === c && e.message, `change: ${c} → ${status} with a message`); }
  assert(db().auditLog.length === before && (await fetchMe()).mustChangePassword === true, "change: refusals write no event and keep the flag");
  const done = await changePassword({ current: s.token, next: "purple tractor sings quietly" });
  assert(done === null, "change: success → 204");
  const me2 = await fetchMe();
  assert(me2.mustChangePassword === false, "change: clears mustChangePassword");
  const prof = await get("/profile");
  assert(typeof prof.passwordChangedAt === "number" && Math.abs(prof.passwordChangedAt - Date.now()) < 60000, "profile: passwordChangedAt set (adapted to ms)");
  const ev2 = db().auditLog.slice(before);
  assert(ev2.length === 1 && ev2[0].type === "auth.password_changed" && ev2[0].actor.id === made.id && ev2[0].entity.id === made.id && !/purple|tractor/.test(JSON.stringify(db())), "change: one event, no password anywhere in the data");
  client.setAuthToken(null); e = await code(() => changePassword({ current: "a", next: "purple tractor sings quietly" })); assert(e?.status === 401, "change: signed out → 401");

  // ---- explorer ----
  assert(AU.AUDIT_TYPES["auth.password_changed"] && AU.AUDIT_TYPES["auth.password_reset"], "audit: both new types have labels");
  assert(EV.EVENT_GROUPS.find((g) => g.id === "access").types.includes("auth.password_reset") && EV.EVENT_GROUPS.find((g) => g.id === "access").types.includes("auth.password_changed"), "audit: both sit in the sign-ins group");
  assert(/own password/.test(EV.describeEvent({ type: "auth.password_changed" })) && /Zara/.test(EV.describeEvent({ type: "auth.password_reset", entity: { id: "u1" } }, { users: { u1: "Zara Ahmed" } })), "audit: events read well in the explorer");
  await as("admin");
  assert(AU.verifyChain(db().auditLog).ok, "chain verifies after the F13b checks");

  // ---- source guards: the forced redirect covers every role route, and the false text is gone ----
  const fs = await import("node:fs");
  const guards = fs.readFileSync("src/routes/guards.jsx", "utf8");
  assert(/mustChangePassword/.test(guards) && /resolvePath\(role, "profile"\)/.test(guards), "guard: RequireRole sends a temporary-password user to their profile");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(d + "/" + x.name) : [d + "/" + x.name]);
  assert(!walk("src").filter((f) => /\.jsx?$/.test(f)).some((f) => /emailed automatically/i.test(fs.readFileSync(f, "utf8"))), "copy: nothing claims a password is emailed automatically");
}

// ── F13c: institution settings ──
{
  const SC = await import("@/lib/institution");
  const AU = await import("@/lib/audit");
  const EV = await import("@/lib/auditEvents");
  const { resetMockData } = await import("@/mocks/db");
  const { updateInstitution } = await import("@/api/institution");
  const { resolvePath } = await import("@/routes/paths");
  const fs = await import("node:fs");
  resetMockData();

  const v = SC.validateInstitutionPatch;
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  assert(v({ name: "Greenfield High" }) === null && v({ allowStudentPhotos: true }) === null && v({ logo: null }) === null && v({ logo: png }) === null, "institution rules: valid partial updates pass");
  assert(v({})._ && v(null)._ && v({ updatedAt: "x" })._ && v({ id: 1 })._, "institution rules: empty body and unknown or server fields are refused");
  assert(v({ name: "" }).name && v({ name: "   " }).name && v({ name: "x".repeat(81) }).name && v({ name: "x".repeat(80) }) === null && v({ name: 5 }).name, "institution rules: name 1–80 characters");
  assert(v({ shortName: "" }).shortName && v({ shortName: "y".repeat(31) }).shortName && v({ city: "z".repeat(61) }).city, "institution rules: short name required ≤30, city ≤60");
  assert(v({ phone: "" }) === null && v({ phone: "+92 51-1234567" }) === null && v({ phone: "abc" }).phone && v({ phone: "1".repeat(21) }).phone, "institution rules: phone as for profiles");
  assert(v({ email: "" }) === null && v({ email: "office@westfield.edu" }) === null && v({ email: "nope" }).email && v({ email: "a b@c.de" }).email && v({ email: 3 }).email, "institution rules: email empty or valid");
  assert(v({ logo: "http://x/y.png" }).logo && v({ logo: "data:image/svg+xml;base64,AAAA" }).logo && v({ logo: "data:image/gif;base64,AAAA" }).logo && v({ logo: 7 }).logo, "institution rules: logo must be a PNG/JPEG data URL (no SVG, GIF or links)");
  const big = "data:image/png;base64," + "A".repeat(Math.ceil((100 * 1024 + 10) * 4 / 3));
  assert(v({ logo: big }).logo && SC.logoBytes(png) === 70 && SC.logoBytes(big) > SC.LOGO_MAX_BYTES, "institution rules: logo ≤ 100 KB decoded (size computed from base64)");
  assert(v({ allowStudentPhotos: "yes" }).allowStudentPhotos && v({ allowStudentPhotos: 1 }).allowStudentPhotos, "institution rules: photo switch is a boolean");
  const f = SC.fitWidth;
  assert(JSON.stringify(f(1000, 500)) === '{"w":256,"h":128}' && JSON.stringify(f(100, 50)) === '{"w":100,"h":50}' && f(4000, 1).h === 1 && f(256, 300).w === 256, "fitWidth: scales down to 256, never up, keeps the shape");
  assert(JSON.stringify(SC.institutionChangedFields({ name: "A" }, { name: "B", city: "" })) === '["name"]' && SC.institutionChangedFields({}, SC.INSTITUTION_DEFAULTS).length === 0, "institutionChangedFields: names only; defaults count as unchanged");

  // read by every role, defaults when missing
  for (const role of ["student", "teacher", "admin"]) {
    await as(role);
    const sc = await get("/institution");
    assert(sc.name === "Westfield Institute" && sc.shortName === "Westfield" && sc.logo === null && sc.allowStudentPhotos === false && sc.updatedAt === null, `institution: ${role} reads the defaults (photos off)`);
  }
  client.setAuthToken(null); e = await code(() => get("/institution")); assert(e?.status === 401, "institution: signed out → 401");

  // write: admin only
  for (const role of ["student", "teacher"]) { await as(role); e = await code(() => updateInstitution({ name: "Hacked" })); assert(e?.status === 403 && (await get("/institution")).name === "Westfield Institute", `institution: ${role} can't change it (403)`); }
  await as("admin");
  const n0 = db().auditLog.length;
  let sc = await updateInstitution({ name: "  Greenfield High School  ", city: "Islamabad", logo: png, allowStudentPhotos: true });
  assert(sc.name === "Greenfield High School" && sc.city === "Islamabad" && sc.logo === png && sc.allowStudentPhotos === true && typeof sc.updatedAt === "number" && Math.abs(sc.updatedAt - Date.now()) < 60000, "institution: saved trimmed, partial, updatedAt set (ms)");
  assert(sc.shortName === "Westfield" && sc.email === "", "institution: fields not sent keep their value");
  const evs = db().auditLog.slice(n0);
  assert(evs.length === 1 && evs[0].type === "institution.update" && evs[0].actor.role === "admin" && JSON.stringify(evs[0].meta.changed) === '["name","city","logo","allowStudentPhotos"]', "institution: one event with the changed field names");
  assert(!/Greenfield|Islamabad|iVBOR/.test(JSON.stringify(evs[0])), "institution: the event never contains values");
  await updateInstitution({ name: "Greenfield High School", allowStudentPhotos: true });
  assert(db().auditLog.length === n0 + 1, "institution: saving unchanged values writes no event and keeps updatedAt");
  const before = (await get("/institution")).updatedAt;
  await updateInstitution({ logo: null });
  sc = await get("/institution");
  assert(sc.logo === null && sc.updatedAt >= before && JSON.stringify(db().auditLog.at(-1).meta.changed) === '["logo"]', "institution: removing the logo is a change");
  for (const [body, label] of [[{ name: "" }, "empty name"], [{ logo: "data:image/svg+xml;base64,AAAA" }, "SVG logo"], [{ allowStudentPhotos: "on" }, "text switch"], [{ updatedAt: 1 }, "server field"], [{}, "empty body"], [{ email: "x" }, "bad email"]]) {
    const b = db().auditLog.length; e = await code(() => updateInstitution(body));
    assert(e?.status === 400 && e.code === "INVALID_INSTITUTION" && db().auditLog.length === b, `institution refuses ${label} (400 INVALID_INSTITUTION, nothing logged)`);
  }
  await as("student"); assert((await get("/institution")).name === "Greenfield High School", "institution: every role sees the admin's change");

  // explorer + wiring
  assert(AU.AUDIT_TYPES["institution.update"] && EV.EVENT_GROUPS.find((g) => g.id === "accounts").types.includes("institution.update") && /name, logo/.test(EV.describeEvent({ type: "institution.update", meta: { changed: ["name", "logo"] } })), "audit: institution.update has a label, a group and a description");
  assert(resolvePath("admin", "institution") === "/admin/institution" && /id: "institution"/.test(fs.readFileSync("src/layout/navConfig.js", "utf8")) && /route\("institution"/.test(fs.readFileSync("src/routes/index.jsx", "utf8")), "institution: route, path and nav entry exist (admin)");
  assert(!/id: "institution"/.test(fs.readFileSync("src/layout/navConfig.js", "utf8").split("teacher:")[1] ?? ""), "institution: not in the teacher or student nav");
  await as("admin"); assert(AU.verifyChain(db().auditLog).ok, "chain verifies after the F13c checks");
}

// ── F13d: photos (policy, upload/remove, who sees what) ──
{
  const PP = await import("@/lib/photoPolicy");
  const AU = await import("@/lib/audit");
  const EV = await import("@/lib/auditEvents");
  const { resetMockData } = await import("@/mocks/db");
  const { setPhoto, removePhoto } = await import("@/api/profile");
  const { updateInstitution } = await import("@/api/institution");
  const { removeUserPhoto } = await import("@/api/admin");
  const fs = await import("node:fs");
  resetMockData();

  const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD" + "A".repeat(200);
  // --- pure validation
  assert(PP.validatePhotoDataUrl(jpeg) === null && PP.validatePhotoDataUrl("data:image/png;base64,AAAA") === null && PP.validatePhotoDataUrl("data:image/webp;base64,AAAA") === null, "photo rules: JPEG, PNG and WebP data URLs pass");
  assert(PP.validatePhotoDataUrl("data:image/svg+xml;base64,AAAA") && PP.validatePhotoDataUrl("data:image/gif;base64,AAAA") && PP.validatePhotoDataUrl("https://x/y.jpg") && PP.validatePhotoDataUrl(null) && PP.validatePhotoDataUrl(5) && PP.validatePhotoDataUrl(""), "photo rules: SVG, GIF, links and non-strings are refused");
  const bigPhoto = "data:image/jpeg;base64," + "A".repeat(Math.ceil((60 * 1024 + 10) * 4 / 3));
  assert(PP.validatePhotoDataUrl(bigPhoto) === "The photo must be under 60 KB" && PP.PHOTO_SIZE === 256, "photo rules: ≤ 60 KB decoded, 256 px master");

  // --- policy table: every viewer/owner pair, switch on and off
  const S1 = { id: "s1", role: "student", classId: "c1" }, S2 = { id: "s2", role: "student", classId: "c1" }, S3 = { id: "s3", role: "student", classId: "c2" };
  const T1 = { id: "t1", role: "teacher", classIds: ["c1"] }, T2 = { id: "t2", role: "teacher", classIds: ["c2"] }, AD = { id: "a1", role: "admin" };
  const can = (viewer, owner, on) => PP.canSeePhoto({ viewer, owner, institution: { allowStudentPhotos: on } });
  for (const on of [false, true]) {
    assert(can(S1, S1, on) && can(T1, T1, on) && can(AD, AD, on), `policy (switch ${on}): everyone sees their own`);
    assert(!can(S1, S2, on) && !can(S1, S3, on), `policy (switch ${on}): a student never sees another student's`);
    assert(can(S1, T1, on) && can(S1, T2, on) && can(S1, AD, on), `policy (switch ${on}): students see staff photos`);
    assert(can(T1, T2, on) && can(T1, AD, on) && can(AD, T1, on), `policy (switch ${on}): staff see staff`);
    assert(can(AD, S1, on) && can(AD, S3, on), `policy (switch ${on}): the admin sees every photo`);
  }
  assert(can(T1, S1, true) && can(T1, S2, true) && !can(T1, S3, true) && !can(T2, S1, true), "policy: a teacher sees students of their own classes only (switch on)");
  assert(!can(T1, S1, false) && !can(T1, S2, false) && !can(T2, S3, false), "policy: a teacher sees no student photos while the switch is off");
  assert(!PP.canSeePhoto({ viewer: null, owner: S1, institution: {} }) && !PP.canSeePhoto({ viewer: T1, owner: null, institution: {} }) && !PP.canSeePhoto({ viewer: T1, owner: S1, institution: undefined }), "policy: missing viewer, owner or institution → no");
  assert(PP.canUploadPhoto({ role: "teacher", institution: { allowStudentPhotos: false } }) && PP.canUploadPhoto({ role: "admin" }) && !PP.canUploadPhoto({ role: "student", institution: { allowStudentPhotos: false } }) && !PP.canUploadPhoto({ role: "student" }) && PP.canUploadPhoto({ role: "student", institution: { allowStudentPhotos: true } }), "policy: students upload only when the institution allows it");

  // --- API: staff upload, student refused while off
  await as("student");
  const e0 = db().auditLog.length;
  e = await code(() => setPhoto(jpeg)); assert(e?.status === 403 && e.code === "PHOTOS_DISABLED" && db().auditLog.length === e0, "photo: a student is refused while the institution switch is off (403 PHOTOS_DISABLED, nothing logged)");
  const tea = await as("teacher");
  let me = await setPhoto(jpeg);
  assert(me.photoUrl === jpeg && (await get("/profile")).photoUrl === jpeg && (await fetchMe()).photoUrl === jpeg, "photo: a teacher can set one; profile and /auth/me return it");
  const ev = db().auditLog.slice(e0).filter((x) => x.type.startsWith("profile.photo"));
  assert(ev.length === 1 && ev[0].type === "profile.photo_set" && ev[0].actor.id === tea.id && !JSON.stringify(ev[0]).includes("/9j/"), "photo: one event, no image data in it");
  for (const [bad, label] of [["data:image/gif;base64,AAAA", "GIF"], ["data:image/svg+xml;base64,AAAA", "SVG"], [bigPhoto, "61 KB photo"], ["https://x/y.jpg", "link"], [null, "nothing"]]) {
    const b = db().auditLog.length; e = await code(() => setPhoto(bad));
    assert(e?.status === 400 && e.code === "INVALID_PHOTO" && db().auditLog.length === b, `photo: ${label} refused (400 INVALID_PHOTO, nothing logged)`);
  }
  assert((await get("/profile")).photoUrl === jpeg, "photo: refusals keep the old photo");

  // --- visibility across payloads
  await as("teacher");
  const cls = (await get("/classes"))[0];
  const kids = db().users.filter((u) => u.role === "student" && u.classId === cls.id);
  const asId = (id) => client.setAuthToken(`mock.${id}`);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  assert(kids.length >= 2, "setup: the teacher's first class has at least two students");
  const post = await client.call("/threads", { method: "POST", body: { classId: cls.id, tag: "Discussion", title: "From the teacher", body: "Photos on the thread" } });
  asId(kids[0].id);
  assert((await get("/threads")).find((t) => t.id === post.id).authorPhotoUrl === jpeg, "visibility: a student sees the teacher's photo on a discussion thread");

  // switch on → a student may upload; the classmate does not see it; the class teacher does
  await as("admin");
  await updateInstitution({ allowStudentPhotos: true });
  asId(kids[0].id);
  me = await setPhoto(png);
  assert(me.photoUrl === png && (await fetchMe()).photoUrl === png, "photo: with the switch on a student can set one and sees it");
  const myPost = await client.call("/threads", { method: "POST", body: { tag: "Question", title: "Mine", body: "A student post" } });
  assert((await get("/threads")).find((t) => t.id === myPost.id).authorPhotoUrl === png, "visibility: the student sees their own photo on their thread");
  asId(kids[1].id);
  assert((await get("/threads")).find((t) => t.id === myPost.id).authorPhotoUrl === null, "visibility: a classmate never sees it (thread author photo is null)");
  await as("teacher");
  const tThread = async () => (await get(`/threads?classId=${cls.id}`)).find((t) => t.id === myPost.id);
  assert((await tThread()).authorPhotoUrl === png, "visibility: the class's teacher sees it while the switch is on");
  await as("admin");
  assert((await get("/users")).find((u) => u.id === kids[0].id).photoUrl === png, "visibility: the admin's account list carries it");
  await updateInstitution({ allowStudentPhotos: false });
  await as("teacher");
  assert((await tThread()).authorPhotoUrl === null, "visibility: switching it off hides student photos from teachers at once");
  asId(kids[0].id);
  assert((await get("/profile")).photoUrl === png, "visibility: the owner still sees their own after the switch goes off");
  await as("admin");
  assert((await get("/users")).find((u) => u.id === kids[0].id).photoUrl === png, "visibility: the admin still sees it");

  // --- removal
  asId(kids[0].id);
  const n1 = db().auditLog.length;
  me = await removePhoto();
  assert(me.photoUrl === null && db().auditLog.length === n1 + 1 && db().auditLog.at(-1).type === "profile.photo_removed", "photo: removing your own works and writes one event");
  await removePhoto();
  assert(db().auditLog.length === n1 + 1, "photo: removing when there is none writes no event");
  await as("teacher"); await setPhoto(jpeg);
  e = await code(() => removeUserPhoto(tea.id)); assert(e?.status === 403, "photo: only an admin can remove someone else's (teacher → 403)");
  await as("admin");
  const gone = await removeUserPhoto(tea.id);
  const aev = db().auditLog.at(-1);
  assert(gone === null && aev.type === "profile.photo_removed" && aev.actor.role === "admin" && aev.entity.id === tea.id && aev.meta.by === "admin", "photo: admin removal → 204, event names the admin and the account");
  e = await code(() => removeUserPhoto("nope")); assert(e?.status === 404, "photo: admin removal of an unknown account → 404");
  await as("teacher"); assert((await get("/profile")).photoUrl === null, "photo: the removed photo is gone for its owner");

  // --- explorer and wiring
  assert(AU.AUDIT_TYPES["profile.photo_set"] && AU.AUDIT_TYPES["profile.photo_removed"] && /Removed the photo of Maya/.test(EV.describeEvent({ type: "profile.photo_removed", meta: { by: "admin" }, entity: { id: "u1" } }, { users: { u1: "Maya" } })) && /their profile photo/.test(EV.describeEvent({ type: "profile.photo_removed" })), "audit: photo events have labels and descriptions");
  assert(EV.EVENT_GROUPS.find((g) => g.id === "accounts").types.includes("profile.photo_set"), "audit: photo events sit in the accounts group");
  const handlers = fs.readFileSync("src/mocks/handlers.js", "utf8");
  assert(!/photoUrl:\s*u\.photo|photoUrl:\s*owner\.photo|\.photo\b[^;\n]*photoUrl/.test(handlers) && (handlers.match(/photoFor\(/g) ?? []).length >= 4, "wiring: photos leave the mock only through photoFor()");
  assert(!/size-8\b.*rounded-lg bg-sidebar-accent/.test(fs.readFileSync("src/layout/Sidebar.jsx", "utf8")) && /src=\{user\?\.photoUrl\}/.test(fs.readFileSync("src/layout/Sidebar.jsx", "utf8")), "wiring: the sidebar avatar receives the photo");
  await as("admin"); assert(AU.verifyChain(db().auditLog).ok, "chain verifies after the F13d checks");
}

// ── F12a: student test history (teacher) ──
{
  const AN = await import("@/lib/analytics"); const SH = await import("@/lib/studentHistory"); const H = await import("@/api/analytics");
  const { db: DB, resetMockData } = await import("@/mocks/db");
  resetMockData();
  await as("teacher");
  const cls = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  const maya = cls.students.find(s=>s.name==="Maya Okafor");
  const det = await get(`/analytics/students/${maya.id}?classId=cls-11a&subjectId=sub-phys-11a`);
  const h = await H.getStudentHistory(maya.id);
  assert(h.student.name==="Maya Okafor" && h.student.cls==="11A" && h.subjects.map(s=>s.name).join()==="Physics,Chemistry,Mathematics", "history: student echoed, every subject of the class listed");
  assert(h.rows.length===6 && h.rows.every((r,i,a)=>i===0||r.at<=a[i-1].at), "history: one row per submitted attempt, newest first");
  const pend = h.rows.filter(r=>r.status==="pending");
  assert(pend.length===1 && pend[0].marks===null && pend[0].percent===null && pend[0].max>0 && pend[0].classAverage===null, "history: a test still being marked is listed with null marks/percent");
  const finals = h.rows.filter(r=>r.status==="final");
  assert(finals.every(r=>{ const t=det.trend.find(p=>p.testId===r.testId); return t && t.you===r.percent && t.class===r.classAverage && r.marks<=r.max; }), "history: percent and class average match the student's analytics trend");
  const att = DB().attempts.find(a=>a.id===finals[0].id);
  const sc = AN.scoreAttempt(att);
  assert(finals[0].marks===sc.earned && finals[0].max===sc.max && finals[0].percent===AN.pct(sc.earned,sc.max), "history: marks come from scoreAttempt");
  assert(finals.every(r=>r.timeTakenSec>=0 && r.submitReason) && h.rows.every(r=>r.subjectId==="sub-phys-11a" && r.subject==="Physics"), "history: time taken, submit reason, subject on every row");
  const ps = finals.map(r=>r.percent);
  assert(h.summary.count===6 && h.summary.final===5 && h.summary.pending===1 && h.summary.average===Math.round(ps.reduce((a,b)=>a+b,0)/5) && h.summary.average===det.summary.average && h.summary.best===Math.max(...ps) && h.summary.lowest===Math.min(...ps), "history: summary leaves pending rows out of every average");
  assert(h.summary.trend===AN.trendOf([...finals].reverse().map(r=>r.percent)) && h.summary.trend===cls.students.find(s=>s.id===maya.id).trend, "history: trend matches the class table's trend");
  // filters
  const chem = await H.getStudentHistory(maya.id, { subject:"sub-chem-11a" });
  assert(chem.rows.length===0 && chem.summary.count===0 && chem.summary.average===null && chem.summary.trend===null && chem.subjects.length===3, "history filter: a subject with no tests → empty, subject list unchanged");
  assert((await H.getStudentHistory(maya.id, { subject:"sub-phys-11a" })).rows.length===6, "history filter: subject");
  assert((await H.getStudentHistory(maya.id, { subject:"sub-phys-11b" })).rows.length===0, "history filter: another class's subject → empty, not an error");
  const mid = h.rows[2].at;
  assert((await H.getStudentHistory(maya.id, { to: mid })).rows.length===4 && (await H.getStudentHistory(maya.id, { from: h.rows[1].at, to: h.rows[1].at })).rows.length===1, "history filter: date range is inclusive at both ends");
  assert((await H.getStudentHistory(maya.id, { from: h.rows[0].at + 1 })).rows.length===0, "history filter: from after the newest → empty");
  e = await code(()=>get(`/analytics/students/${maya.id}/history?from=2026-12-02T00:00:00.000Z&to=2026-12-01T00:00:00.000Z`)); assert(e?.status===400 && e.code==="INVALID_FILTER", "history filter: from after to → 400 INVALID_FILTER");
  e = await code(()=>get(`/analytics/students/${maya.id}/history?from=not-a-date`)); assert(e?.status===400 && e.code==="INVALID_FILTER", "history filter: unparseable date → 400");
  // access
  const aiden = DB().users.find(u=>u.name==="Aiden Kelly");
  e = await code(()=>get(`/analytics/students/${aiden.id}/history`)); assert(e?.status===404, "history: a student of a class the teacher doesn't teach → 404");
  e = await code(()=>get("/analytics/students/nope/history")); assert(e?.status===404, "history: unknown student → 404");
  await as("student"); e = await code(()=>get(`/analytics/students/${maya.id}/history`)); assert(e?.status===403, "history: students get 403");
  // flags by severity
  resetMockData(); await as("teacher");
  const hit = DB().attempts.find(a=>a.student==="Maya Okafor" && a.status==="submitted");
  hit.flags.push({type:"tab-switch",at:1},{type:"window-blur",at:2},{type:"right-click",at:3},{type:"future-type",at:4});
  const hf = await H.getStudentHistory(maya.id);
  assert(hf.rows.find(r=>r.id===hit.id).flags.high===1 && hf.rows.find(r=>r.id===hit.id).flags.medium===1 && hf.rows.find(r=>r.id===hit.id).flags.low===2 && hf.summary.flags.high===1 && hf.summary.flags.low===2, "history: flags counted by severity (unknown types count as low), totals in summary");
  // library
  const rows = [
    { id:"1", subjectId:"a", at:10, status:"final", percent:50, flags:{high:0,medium:0,low:0} },
    { id:"2", subjectId:"b", at:20, status:"pending", percent:null, flags:{high:1,medium:0,low:0} },
    { id:"3", subjectId:"a", at:30, status:"final", percent:70, flags:{high:0,medium:2,low:0} },
  ];
  assert(SH.filterHistory(rows).length===3 && SH.filterHistory(rows,{subject:"a"}).length===2 && SH.filterHistory(rows,{from:20}).length===2 && SH.filterHistory(rows,{to:20}).length===2 && SH.filterHistory(rows,{finalOnly:true}).length===2 && SH.filterHistory(rows,{subject:"",from:null,to:undefined}).length===3, "filterHistory: subject, inclusive range, final only, empty options = no limit");
  const sm = SH.summarizeHistory(rows);
  assert(sm.count===3 && sm.final===2 && sm.pending===1 && sm.average===60 && sm.best===70 && sm.lowest===50 && sm.trend===null && sm.flags.high===1 && sm.flags.medium===2, "summarizeHistory: counts, average of final rows only, flag totals");
  const se = SH.summarizeHistory([]);
  assert(se.count===0 && se.average===null && se.best===null && se.lowest===null && se.trend===null, "summarizeHistory: empty");
  assert(AN.trendOf([])===null && AN.trendOf([50,90])===null && AN.trendOf([50,50,50])==="steady" && AN.trendOf([50,50,60,70])==="up" && AN.trendOf([80,80,70,60])==="down" && AN.trendOf([50,50,55,55])==="up" && AN.trendOf([50,50,54,54])==="steady" && AN.trendOf([70,40,50])==="down", "trendOf: needs 3 tests; latest two vs earlier mean; ±5 band");
  assert(SH.validRange(null,null) && SH.validRange(1,2) && SH.validRange(2,2) && !SH.validRange(3,2) && !SH.validRange(NaN,null), "validRange");
  assert(SH.formatDuration(null)==="—" && SH.formatDuration(45)==="45 s" && SH.formatDuration(720)==="12 min" && SH.formatDuration(3900)==="1 h 05 min", "formatDuration");
  assert(SH.dayStartMs("")===null && SH.dayEndMs("")===null && SH.dayEndMs("2026-11-14")>SH.dayStartMs("2026-11-14") && new Date(SH.dayStartMs("2026-11-14")).getDate()===14 && new Date(SH.dayEndMs("2026-11-14")).getDate()===14, "dayStartMs/dayEndMs: local calendar day");
  // class table columns
  resetMockData(); await as("teacher");
  const c3 = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  const mrow = c3.students.find(s=>s.name==="Maya Okafor");
  const d3 = await get(`/analytics/students/${mrow.id}?classId=cls-11a&subjectId=sub-phys-11a`);
  assert(mrow.lastTest.testId===d3.trend.at(-1).testId && mrow.lastTest.percent===d3.trend.at(-1).you && mrow.lastTest.at===d3.trend.at(-1).at && mrow.trend===AN.trendOf(d3.trend.map(p=>p.you)) && mrow.belowTarget===d3.topics.filter(t=>t.accuracy<75).length, "class table: last test, trend, topics below target match the student's own analytics");
  const none = AN.buildClassAnalytics({ tests:[], attempts:[], students:[{id:"s1",name:"S",roll:"1"}] }).students[0];
  assert(none.lastTest===null && none.trend===null && none.belowTarget===0, "class table: a student with no graded test → null last test / trend, 0 below target");
}

// ── Institution branding (public name + logo, applied across the app) ──
{
  const INS = await import("@/lib/institution"); const { updateInstitution } = await import("@/api/institution");
  const { resetMockData } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  resetMockData();
  client.setAuthToken(null);
  const pub = await get("/institution/public");
  assert(JSON.stringify(Object.keys(pub).sort()) === '["logo","name","shortName"]' && pub.name === "Westfield Institute" && pub.logo === null, "branding: readable signed out, only name, shortName and logo");
  await as("admin");
  const logo = "data:image/png;base64,iVBORw0KGgo=";
  await updateInstitution({ name: "Greenfield University", shortName: "Greenfield", logo, phone: "+92 300 1234567", email: "office@greenfield.edu", allowStudentPhotos: true });
  client.setAuthToken(null);
  const pub2 = await get("/institution/public");
  assert(pub2.name === "Greenfield University" && pub2.shortName === "Greenfield" && pub2.logo === logo && !("phone" in pub2) && !("email" in pub2) && !("allowStudentPhotos" in pub2), "branding: the admin's change shows to signed-out visitors, contacts and policy stay private");
  e = await code(() => get("/institution")); assert(e?.status === 401, "institution: the full settings still need a sign-in");
  assert(JSON.stringify(INS.brandingOf({ name: "A", shortName: "B", logo: undefined, phone: "1", email: "e" })) === '{"name":"A","shortName":"B","logo":null}', "brandingOf: three fields, missing logo → null");
  assert(/\["branding"\]/.test(src("src/api/institution.js")), "branding: saving the institution refreshes the cached branding");
  // wording and wiring (source guards)
  const nav = src("src/layout/navConfig.js");
  assert(/label: "Institution"/.test(nav) && !/label: "School"/.test(nav) && !/Registrar/.test(src("src/layout/Sidebar.jsx")), "wording: the admin nav says Institution, not School");
  assert(!/Vellum/.test(src("src/layout/Sidebar.jsx")) && !/Vellum/.test(src("src/layout/MobileTopBar.jsx")) && !/Westfield/.test(src("src/pages/Login.jsx")) && /Powered by Vellum/.test(src("src/pages/Login.jsx")), "branding: sidebar, mobile bar and sign-in page show the institution, Vellum only as 'Powered by'");
  assert(/useBranding/.test(src("src/layout/Layout.jsx")) && !/BrandMark/.test(src("src/components/take-test/TestRunner.jsx")) && /PrintHeader/.test(src("src/components/teacher-analytics/StudentProfile.jsx")) && /PrintHeader/.test(src("src/components/teacher-analytics/AnalyticsOverview.jsx")), "branding: tab title, test pages and printed analytics use the institution");
  assert(!/\bschool\b/i.test(Object.values(INS.INSTITUTION_DEFAULTS).join(" ")), "institution defaults carry no 'school' wording");
  resetMockData();
}

// ── F12b: parent / student report ──
{
  const RP = await import("@/lib/report"); const R = await import("@/api/reports"); const EV = await import("@/lib/auditEvents");
  const { resetMockData, db: DB } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  const FAR = 4102444800000;
  // ── periods
  const at = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, m, d, h, mi, s, ms).getTime();
  const wed = RP.resolvePeriod("thisWeek", {}, at(2026, 10, 11, 10));
  assert(wed.from === at(2026, 10, 9) && wed.to === at(2026, 10, 15, 23, 59, 59, 999) && /9 Nov – 15 Nov 2026/.test(wed.label), "period: this week runs Monday 00:00 to Sunday 23:59:59.999");
  assert(RP.resolvePeriod("thisWeek", {}, at(2026, 10, 15, 22)).from === at(2026, 10, 9) && RP.resolvePeriod("thisWeek", {}, at(2026, 10, 9, 0, 0, 0)).from === at(2026, 10, 9) && RP.resolvePeriod("thisWeek", {}, at(2026, 10, 8, 23, 59)).from === at(2026, 10, 2), "period: Sunday belongs to the week before it ends, Monday 00:00 starts a new one");
  const l7 = RP.resolvePeriod("last7", {}, at(2026, 10, 11, 10)); assert(l7.from === at(2026, 10, 5) && l7.to === at(2026, 10, 11, 23, 59, 59, 999), "period: last 7 days includes today");
  const mo = RP.resolvePeriod("thisMonth", {}, at(2028, 1, 10)); assert(mo.from === at(2028, 1, 1) && mo.to === at(2028, 1, 29, 23, 59, 59, 999), "period: this month handles a leap February");
  assert(RP.resolvePeriod("custom", { from: 5, to: 9 }, 0).label && RP.resolvePeriod("custom", { from: 9, to: 5 }) === null && RP.resolvePeriod("custom", { from: null, to: 5 }) === null && RP.resolvePeriod("custom", {}) === null && RP.resolvePeriod("nope", {}) === null, "period: a backwards, missing or unknown range → null");
  // ── next steps and draft
  const ns = RP.nextStepsFromTopics([{ name: "Waves", accuracy: 40 }, { name: "Heat", accuracy: 60 }, { name: "A", accuracy: 61 }, { name: "B", accuracy: 62 }]);
  assert(ns.length === 3 && /Waves: go through/.test(ns[0]) && /Heat: practise/.test(ns[1]) && RP.nextStepsFromTopics([]).length === 1, "nextSteps: by band, at most 3, a default when nothing is weak");
  // ── builder
  const row = (id, at, percent, classAverage, test = `Test ${id}`) => ({ id, testId: `t${id}`, test, subjectId: "s1", subject: "Physics", at, status: "final", marks: percent / 10, max: 10, percent, classAverage, flags: { high: 3, medium: 0, low: 0 }, timeTakenSec: 5, submitReason: "manual" });
  const student = { id: "u1", name: "Maya Okafor", roll: "11A-07", cls: "11A" };
  const rows = [row(1, 100, 50, 60), row(2, 200, 60, 62), row(3, 300, 70, 64), row(4, 400, 90, 66), row(5, 9000, 10, 10)];
  const period = { key: "custom", from: 150, to: 450 };
  const topics = [{ name: "Heat", accuracy: 90 }, { name: "Waves", accuracy: 40 }, { name: "Optics", accuracy: 74 }, { name: "Motion", accuracy: 75 }];
  const rep = RP.buildReport({ student, institution: { name: "Greenfield", logo: null }, preset: "weekly", period, subjectName: null, rows, topics, options: { sections: {}, comment: "  Well done.  " }, now: 1 });
  assert(rep.summary.tests === 3 && rep.summary.average === 73 && rep.summary.classAverage === 64 && rep.trend.length === 3 && rep.tests.map((t) => t.testId).join() === "t4,t3,t2", "report: only tests inside the period count; tests listed newest first");
  assert(rep.summary.trend === "up" && rep.topics.strong.map((t) => t.name).join() === "Heat,Motion" && rep.topics.weak.map((t) => t.name).join() === "Waves,Optics" && rep.comment === "Well done." && /Waves: go through/.test(rep.nextSteps[0]), "report: trend from all tests up to the period end, strong/weak split at 75%, comment trimmed, next steps from the weak topics");
  assert(!/flags|timeTaken|submitReason|manual/.test(JSON.stringify({ ...rep, header: { ...rep.header, institution: null } })) && !/Other/.test(JSON.stringify(rep)), "report: no flags, timings or other students' data in the report");
  const off = RP.buildReport({ student, preset: "weekly", period, rows, topics, options: { sections: { summary: false, trend: false, topics: false, tests: false, comment: false, nextSteps: false }, comment: "x" }, now: 1 });
  assert(off.summary === null && off.trend.length === 0 && off.topics === null && off.tests.length === 0 && off.comment === "" && off.nextSteps.length === 0 && off.header.student.name === "Maya Okafor", "report: every section can be switched off");
  assert(RP.buildReport({ student, preset: "weekly", period: { key: "custom", from: 5000, to: 6000 }, rows, topics, options: {}, now: 1 }).empty === true && RP.buildReport({ student, preset: "weekly", period, rows, topics, options: { comment: "x".repeat(2000) }, now: 1 }).comment.length === RP.COMMENT_MAX, "report: empty period flagged, comment capped at 1000");
  const tr = RP.buildReport({ student, preset: "test", period: null, rows: [rows[3]], topics, questions: [{ no: 1, topic: "Heat", marks: 1, max: 2, feedback: "Show units" }], options: {}, now: 1 });
  assert(tr.kind === "test" && tr.questions.length === 1 && tr.trend.length === 0 && tr.summary.trend === null && tr.tests.length === 1 && /Test 4/.test(tr.header.period.label), "report: a test report has the question list, no trend");
  const h1 = RP.reportContentHash(rep);
  assert(/^[0-9a-f]{64}$/.test(h1) && h1 === RP.reportContentHash(RP.buildReport({ student, institution: { name: "Other U" }, preset: "weekly", period, rows: [...rows].reverse(), topics, options: { sections: {}, comment: "  Well done.  " }, now: 999 })) && h1 !== RP.reportContentHash(RP.buildReport({ student, preset: "weekly", period, rows, topics, options: { comment: "Different" }, now: 1 })), "report hash: stable for the same content, ignoring letterhead, print time and row order; changes with the comment");
  assert(/Maya averaged 73% across 3 tests/.test(RP.draftComment(rep)) && /Heat/.test(RP.draftComment(rep)) && RP.draftComment({ summary: { tests: 0 }, header: { student } }) === "", "draftComment: a short factual draft, empty when there are no tests");
  // ── file names
  const fn = (name, key = "thisWeek", from = at(2026, 10, 9), kind = "weekly") => RP.reportFileName({ kind, header: { student: { id: "u-maya", name }, period: { key, from } } });
  assert(fn("Maya Okafor") === "Maya-Okafor-Weekly-2026-11-09.pdf" && fn("José Álvarez") === "Jose-Alvarez-Weekly-2026-11-09.pdf" && fn("مایا") === "u-maya-Weekly-2026-11-09.pdf" && fn("A/B: C?*") === "A-B-C-Weekly-2026-11-09.pdf" && fn("Maya", "thisMonth") === "Maya-Monthly-2026-11-09.pdf" && fn("Maya", "custom") === "Maya-Progress-2026-11-09.pdf" && fn("Maya", "test", at(2026, 10, 9), "test") === "Maya-Test-2026-11-09.pdf" && /^[\x20-\x7e]+$/.test(fn("مایا")), "file name: ASCII only, unsafe characters removed, falls back to the student id");

  // ── API
  resetMockData(); await as("teacher");
  const cls = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  const maya = cls.students.find((s) => s.name === "Maya Okafor");
  const all = { studentId: maya.id, preset: "weekly", period: "custom", from: 0, to: FAR };
  const d = await R.getReportData(all);
  assert(d.student.name === "Maya Okafor" && d.student.cls === "11A" && d.rows.length === 5 && d.excluded.pending === 1 && d.excluded.unreleased === 0 && d.subjects.length === 3 && d.subjectName === null, "report data: confirmed rows only (the test still being marked is counted as left out)");
  assert(d.rows.every((r) => r.status === "final" && r.percent != null && !("flags" in r) && !("submitReason" in r) && !("timeTakenSec" in r)) && d.topics.length > 0 && d.questions === null, "report data: no flags, timings or submit reasons are sent");
  assert((await R.getReportData({ ...all, subjectId: "sub-chem-11a" })).rows.length === 0 && (await R.getReportData({ ...all, from: d.rows[1].at, to: d.rows[1].at })).rows.length === 4, "report data: subject filter; rows run up to the period end so the trend can use earlier tests");
  // release
  const unrel = DB().tests.find((t) => t.id === d.rows[0].testId); unrel.settings = { ...(unrel.settings ?? {}), release: "afterClose" }; unrel.stoppedAt = null; unrel.schedule = { ...(unrel.schedule ?? {}), availableUntil: FAR };
  const d2 = await R.getReportData(all);
  assert(d2.rows.length === 4 && d2.excluded.unreleased === 1 && !d2.rows.some((r) => r.testId === unrel.id), "report data: a result not yet released to the student is left out of every number");
  e = await code(() => R.getReportData({ studentId: maya.id, preset: "test", testId: unrel.id })); assert(e?.status === 409 && e.code === "NOT_READY", "report data: a test report for an unreleased result → 409 NOT_READY");
  const pendingRow = (await get(`/analytics/students/${maya.id}/history`)).rows.find((r) => r.status === "pending");
  e = await code(() => R.getReportData({ studentId: maya.id, preset: "test", testId: pendingRow.testId })); assert(e?.status === 409 && e.code === "NOT_READY", "report data: a test still being marked → 409 NOT_READY");
  resetMockData(); await as("teacher");
  const cls2 = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a");
  const maya2 = cls2.students.find((s) => s.name === "Maya Okafor"); all.studentId = maya2.id; maya.id = maya2.id;
  const d3 = await R.getReportData(all);
  const t1 = await R.getReportData({ studentId: maya.id, preset: "test", testId: d3.rows[0].testId });
  assert(t1.rows.length === 1 && t1.questions.length > 0 && t1.questions.every((q) => q.no && "marks" in q && "feedback" in q && !("text" in q)) && t1.questions.reduce((a, q) => a + q.marks, 0) === t1.rows[0].marks, "report data: a test report lists each question's topic, marks and feedback, never the question text");
  // access and validation
  const aiden = DB().users.find((u) => u.name === "Aiden Kelly");
  e = await code(() => R.getReportData({ ...all, studentId: aiden.id })); assert(e?.status === 404, "report data: a student of a class the teacher doesn't teach → 404");
  e = await code(() => R.getReportData({ ...all, studentId: "nope" })); assert(e?.status === 404, "report data: unknown student → 404");
  e = await code(() => R.getReportData({ ...all, subjectId: "sub-nope" })); assert(e?.status === 404, "report data: unknown subject → 404");
  e = await code(() => R.getReportData({ studentId: maya.id, preset: "test", testId: "nope" })); assert(e?.status === 404, "report data: unknown test → 404");
  e = await code(() => R.getReportData({ ...all, preset: "daily" })); assert(e?.status === 400 && e.code === "INVALID_REPORT", "report data: unknown report type → 400");
  e = await code(() => R.getReportData({ ...all, from: 9, to: 5 })); assert(e?.status === 400 && e.code === "INVALID_REPORT", "report data: backwards dates → 400");
  e = await code(() => get(`/reports/data?studentId=${maya.id}&preset=weekly`)); assert(e?.status === 400 && e.code === "INVALID_REPORT", "report data: weekly without dates → 400");
  // snapshot + events
  const secret = "Maya improved a lot, secret remark";
  const opts = { sections: { nextSteps: false }, comment: secret };
  const n0 = DB().auditLog.length;
  const made = await R.createReport({ ...all, options: opts });
  const mine = RP.buildReport({ student: d3.student, institution: { name: "Whatever" }, preset: "weekly", period: { key: "custom", from: 0, to: FAR }, subjectName: d3.subjectName, rows: d3.rows, topics: d3.topics, questions: null, excluded: d3.excluded, options: opts, now: 12345 });
  assert(made.id && made.contentHash === RP.reportContentHash(mine) && typeof made.generatedAt === "number", "report snapshot: the server's content hash equals the page's");
  const snap = DB().reports.find((r) => r.id === made.id);
  assert(snap.studentId === maya.id && snap.preset === "weekly" && snap.period.key === "custom" && snap.createdBy && snap.contentHash === made.contentHash && !JSON.stringify(snap).includes("secret"), "report snapshot: id, student, period and hash are kept, the comment is not");
  const ev = DB().auditLog.at(-1);
  assert(DB().auditLog.length === n0 + 1 && ev.type === "report.generate" && ev.entity.id === made.id && ev.studentId === maya.id && JSON.stringify(Object.keys(ev.meta).sort()) === '["preset","studentId"]' && !JSON.stringify(ev).includes("secret") && !/[0-9]{2}%/.test(JSON.stringify(ev.meta)), "report event: report.generate with the preset and student, never the comment or marks");
  assert(EV.describeEvent(ev) === "Progress report prepared.", "report event: readable in the audit explorer");
  const mt = await R.createReport({ studentId: maya.id, preset: "test", testId: t1.rows[0].testId, options: {} });
  const mineT = RP.buildReport({ student: t1.student, preset: "test", period: null, subjectName: t1.subjectName, rows: t1.rows, topics: t1.topics, questions: t1.questions, excluded: t1.excluded, options: {}, now: 1 });
  assert(mt.contentHash === RP.reportContentHash(mineT) && DB().reports.find((r) => r.id === mt.id).testId === t1.rows[0].testId, "report snapshot: a test report hashes the same on both sides");
  e = await code(() => R.createReport({ ...all, from: 9, to: 5, options: {} })); assert(e?.status === 400 && DB().auditLog.length === n0 + 2, "report snapshot: a bad request saves and logs nothing");
  const n1 = DB().auditLog.length;
  assert((await R.markReportExported(made.id, "pdf")).channel === "pdf" && DB().auditLog.at(-1).type === "report.export" && DB().auditLog.at(-1).meta.channel === "pdf" && DB().auditLog.at(-1).studentId === maya.id && DB().auditLog.length === n1 + 1, "report export: logged with the way it was shared");
  e = await code(() => R.markReportExported(made.id, "fax")); assert(e?.status === 400 && e.code === "INVALID_CHANNEL" && DB().auditLog.length === n1 + 1, "report export: unknown channel → 400, nothing logged");
  e = await code(() => R.markReportExported("nope", "pdf")); assert(e?.status === 404, "report export: unknown report → 404");
  assert(EV.describeEvent(DB().auditLog.at(-1)) === "Report saved as PDF.", "report export: readable in the audit explorer");
  for (const role of ["student", "admin"]) { await as(role); e = await code(() => R.getReportData(all)); const e2 = await code(() => R.createReport({ ...all, options: {} })); assert(e?.status === 403 && e2?.status === 403, `reports: ${role} gets 403`); }
  client.setAuthToken(null); e = await code(() => R.getReportData(all)); assert(e?.status === 401, "reports: signed out → 401");
  // wiring
  const idx = src("src/routes/index.jsx"); const css = src("src/styles/index.css");
  assert(/analytics\/:studentId\/report/.test(idx) && /TeacherStudentReport/.test(idx), "wiring: the report route exists");
  assert(["Sidebar", "TopBar", "MobileTopBar"].every((f) => /no-print/.test(src(`src/layout/${f}.jsx`))) && /print:block/.test(src("src/layout/Layout.jsx")), "wiring: the app chrome is hidden when printing");
  assert(/\.report-sheet/.test(css) && /Noto Nastaliq Urdu/.test(css) && /Noto Naskh Arabic/.test(css) && /break-inside/.test(css) && /@page \{ size: A4/.test(css), "wiring: A4 print rules and Urdu font fallbacks");
  assert(!/flags/i.test(src("src/components/teacher-report/ReportSheet.jsx")) && /dir="auto"/.test(src("src/components/teacher-report/ReportSheet.jsx")) && /dir="auto"/.test(src("src/components/teacher-report/ReportOptions.jsx")), "wiring: the sheet never mentions flags; Urdu or English text is laid out with dir=auto");
  assert(/Make parent report/.test(src("src/components/teacher-analytics/StudentProfile.jsx")) && /order/.test(src("src/pages/TeacherAnalytics.jsx")) && /\.pdf/.test(src("src/lib/report.js")) && /afterprint/.test(src("src/pages/TeacherStudentReport.jsx")), "wiring: entry button, student order hand-off, PDF file name via the print title");
  resetMockData();
}

// ── F12b follow-up: Urdu / bilingual report ──
{
  const RP = await import("@/lib/report"); const LB = await import("@/lib/reportLabels"); const R = await import("@/api/reports");
  const { db: DB, resetMockData } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  const AR = /[\u0600-\u06FF]/;
  const keys = Object.keys(LB.REPORT_LABELS);
  assert(keys.every((k) => LB.REPORT_LABELS[k][0] && LB.REPORT_LABELS[k][1]) && keys.filter((k) => k !== "percent").every((k) => AR.test(LB.REPORT_LABELS[k][1]) && !/[A-Za-z]/.test(LB.REPORT_LABELS[k][1].replace(/Q|\d/g, ""))), "report labels: every key has English and Urdu; the Urdu uses Arabic script");
  assert(LB.label("en", "summary") === "Summary" && AR.test(LB.label("ur", "summary")) && LB.label("both", "summary").startsWith("Summary · ") && LB.label("both", "percent") === "%", "report labels: en, ur and both");
  const weak = [{ name: "Waves", accuracy: 40 }, { name: "Heat", accuracy: 60 }];
  const ur = RP.nextStepsFromTopics(weak, "ur"), both = RP.nextStepsFromTopics(weak, "both");
  assert(ur.length === 2 && ur.every((s) => AR.test(s)) && ur[0].startsWith("Waves:") && both.length === 4 && /go through/.test(both[0]) && AR.test(both[1]) && RP.nextStepsFromTopics([], "ur").length === 1 && AR.test(RP.nextStepsFromTopics([], "ur")[0]) && RP.nextStepsFromTopics(weak, "xx").every((s) => !AR.test(s)), "next steps: Urdu, both (English then Urdu per topic), unknown language → English");
  const row = (id, at, percent, cls) => ({ id, testId: `t${id}`, test: `T${id}`, subjectId: "s", subject: "Physics", at, status: "final", marks: percent / 10, max: 10, percent, classAverage: cls });
  const rows = [row(1, 100, 60, 60), row(2, 200, 70, 62), row(3, 300, 90, 64)];
  const base = { student: { id: "u1", name: "Maya Okafor", roll: "1", cls: "11A" }, preset: "weekly", period: { key: "custom", from: 0, to: 400 }, rows, topics: [{ name: "Heat", accuracy: 90 }, { name: "Waves", accuracy: 40 }], now: 1 };
  const en = RP.buildReport({ ...base, options: {} }), u = RP.buildReport({ ...base, options: { language: "ur" } }), b = RP.buildReport({ ...base, options: { language: "both" } }), bad = RP.buildReport({ ...base, options: { language: "klingon" } });
  assert(en.language === "en" && u.language === "ur" && b.language === "both" && bad.language === "en" && AR.test(u.nextSteps[0]) && RP.DEFAULT_REPORT_OPTIONS.language === "en", "report: a language option; unknown values fall back to English");
  assert(RP.reportContentHash(en) === RP.reportContentHash(bad) && new Set([en, u, b].map(RP.reportContentHash)).size === 3, "report hash: covers the language");
  const dc = RP.draftComment(u, "ur");
  assert(AR.test(dc) && /73%/.test(dc) && /Heat/.test(dc) && /Waves/.test(dc) && !/\b(was|averaged)\b/.test(dc) && /averaged 73%/.test(RP.draftComment(en)) && /averaged 73%/.test(RP.draftComment(b, "both")), "draft comment: Urdu and English versions (both → English)");
  // phrases
  assert(LB.COMMENT_PHRASES.length >= 8 && LB.COMMENT_PHRASES.every((p) => p.id && p.en && AR.test(p.ur) && p.en.length < 120), "phrases: each has English and Urdu");
  const p0 = LB.COMMENT_PHRASES[0];
  assert(LB.addPhrase("", p0, "en", 1000) === p0.en && LB.addPhrase("Hello", p0, "en", 1000) === `Hello ${p0.en}` && LB.addPhrase("Hello", p0, "ur", 1000) === `Hello\n${p0.ur}` && LB.addPhrase(p0.ur, p0, "ur", 1000) === `${p0.ur} ${p0.ur}` && LB.addPhrase("x", p0, "en", 5) === "x", "phrases: added after the text, a new line when Urdu follows English, never past the limit");
  // api
  resetMockData(); await as("teacher");
  const cls = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a"); const maya = cls.students.find((s) => s.name === "Maya Okafor");
  const params = { studentId: maya.id, preset: "weekly", period: "custom", from: 0, to: 4102444800000 };
  const d = await R.getReportData(params);
  for (const language of ["ur", "both", "en", "klingon"]) {
    const opts = { sections: {}, comment: "اچھی پیش رفت ہے۔", language };
    const made = await R.createReport({ ...params, options: opts });
    const mine = RP.buildReport({ student: d.student, preset: "weekly", period: { key: "custom", from: 0, to: 4102444800000 }, subjectName: d.subjectName, rows: d.rows, topics: d.topics, questions: null, excluded: d.excluded, options: opts, now: 5 });
    assert(made.contentHash === RP.reportContentHash(mine), `report snapshot: server and page hashes agree in language "${language}"`);
  }
  assert(!JSON.stringify(DB().auditLog.at(-1)).includes("اچھی"), "report event: an Urdu comment is not logged either");
  // wiring
  const sheet = src("src/components/teacher-report/ReportSheet.jsx"), css = src("src/styles/index.css"), opts = src("src/components/teacher-report/ReportOptions.jsx"), page = src("src/pages/TeacherStudentReport.jsx");
  assert(/dir=\{lang === "ur" \? "rtl" : "ltr"\}/.test(sheet) && /lang="ur"/.test(sheet) && /text-start|text-end/.test(sheet) && !/text-left|text-right/.test(sheet) && /dir="ltr"/.test(sheet), "wiring: an Urdu sheet is right-to-left with logical alignment; chart and numbers stay left-to-right");
  assert(/\[lang="ur"\][^}]*letter-spacing: 0/.test(css) && /\[lang="ur"\][^}]*text-transform: none/.test(css), "wiring: no letter-spacing or capitals on Urdu text (they break the joined letters)");
  assert(/Report language/.test(opts) && /Quick phrases/.test(opts) && /addPhrase/.test(opts) && /Microsoft Print to PDF/.test(page) && /language: options\.language/.test(page), "wiring: language choice, quick phrases, and the print-to-PDF hint");
  assert(/argsIgnorePattern/.test(src("eslint.config.js")), "lint: component props named like components are not reported");
  resetMockData();
}

// ── F12c1: parent contacts ──
{
  const CT = await import("@/lib/contact"); const AD = await import("@/api/admin"); const GU = await import("@/api/guardian"); const EV = await import("@/lib/auditEvents"); const AU = await import("@/lib/audit");
  const { resetMockData, db: DB } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  const asEmail = async (email, role) => { const s = await login({ email, password: "x", role }); client.setAuthToken(s.token); return s.user; };
  // ── phone rules
  const good = ["03001234567", "0300-1234567", "+92 300 1234567", "0092 300 1234567", "923001234567", "+92 (0) 300 1234567", "(0300) 123 4567", "+92-300-1234567"];
  assert(good.every((s) => CT.normalizePkPhone(s) === "923001234567"), "phone: every usual way of writing a mobile number gives 923001234567");
  assert(CT.normalizePkPhone("0345 1234567") === "923451234567" && CT.normalizePkPhone("03551234567") === "923551234567" && CT.normalizePkPhone("0310-1234567") === "923101234567", "phone: Jazz, Telenor, SCOM and Zong prefixes pass");
  const bad = ["042-35761234", "+92 42 35761234", "0300123456", "030012345678", "0300-ABC4567", "", "   ", null, 5, "+1 555 123 4567", "0360 1234567", "0200 1234567", "03+001234567", "92300123456", "+92300123456789"];
  assert(bad.every((s) => CT.normalizePkPhone(s) === null), "phone: landlines, wrong lengths, letters, other countries and non-strings are refused");
  assert(CT.maskPhone("0300-1234567") === "+92 300 ••• 4567" && CT.maskPhone("nope") === "" && !CT.maskPhone("923001234567").includes("123") && CT.localPhone("923001234567") === "0300-1234567" && CT.localPhone("") === "", "phone: masked keeps the network code and the last four digits; local form for the edit box");
  assert(CT.toWaLink("0300-1234567", "Hi\nاردو") === "https://wa.me/923001234567?text=Hi%0A%D8%A7%D8%B1%D8%AF%D9%88" && CT.toWaLink("0300-1234567") === "https://wa.me/923001234567" && CT.toWaLink("12") === null && !/[+ ]/.test(CT.toWaLink("+92 300 1234567", "x").split("?")[0]), "wa.me link: digits only, encoded text, newline and Urdu survive, bad number → null");
  const room = CT.WA_URL_BUDGET - "https://wa.me/923001234567?text=".length;
  assert(CT.fitsWhatsApp("a".repeat(room)) && !CT.fitsWhatsApp("a".repeat(room + 1)) && CT.fitsWhatsApp("") && CT.fitsWhatsApp("ا".repeat(Math.floor(room / 6))) && !CT.fitsWhatsApp("ا".repeat(Math.floor(room / 6) + 1)), "wa.me budget: exact boundary in English; an Urdu letter costs 6 characters of the link");
  assert(!CT.fitsWhatsApp("a b ".repeat(400)) && CT.fitsWhatsApp("a b ".repeat(100)), "wa.me budget: spaces cost 3 characters each");
  // ── validation
  const v = CT.validateGuardian;
  assert(v({ name: "Mr Ali", phone: "0300-1234567" }) === null && v({ name: "", phone: "" }) === null && v({ phone: "03001234567" }) === null && v({ name: "علی" }) === null, "guardian rules: valid bodies, empty removes, one key alone is fine, Urdu names pass");
  assert(v({})._ && v(null)._ && v([])._ && v({ email: "x" })._ && v({ name: 4 }).name && v({ phone: 4 }).phone && v({ phone: "123" }).phone && v({ name: "x".repeat(81) }).name && v({ name: "x".repeat(80) }) === null && v({ name: "<b>x" }).name, "guardian rules: unknown keys, wrong types, bad numbers, 80-character cap, markup refused");
  assert(JSON.stringify(CT.cleanGuardian({ name: "  Mr   Ali ", phone: "+92 300 1234567" })) === '{"name":"Mr Ali","phone":"923001234567"}' && CT.cleanGuardian({ name: "", phone: " " }).phone === "", "guardian rules: name tidied, number normalised, blank = none");
  assert(CT.guardianChanged({ name: "A", phone: "1" }, { name: "A", phone: "2" }).join() === "phone" && CT.guardianChanged({ name: "", phone: "" }, { name: "A", phone: "1" }).join() === "name,phone" && CT.guardianChanged({}, { name: "", phone: "" }).length === 0, "guardian rules: changed = field names only; missing equals empty");
  // ── endpoints
  resetMockData(); await asEmail("r.chen@westfield.edu", "teacher");
  const cls = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a"); const maya = cls.students.find((s) => s.name === "Maya Okafor");
  let g = await get(`/students/${maya.id}/guardian`);
  assert(g.name === "" && g.phone === "" && g.masked === "", "guardian: empty until set");
  const n0 = DB().auditLog.length;
  g = await GU.saveGuardian(maya.id, { name: "  Mr.  Tariq Mahmood ", phone: "0300-1234567" });
  assert(g.name === "Mr. Tariq Mahmood" && g.phone === "923001234567" && g.masked === "+92 300 ••• 4567" && (await get(`/students/${maya.id}/guardian`)).phone === "923001234567", "guardian: teacher of the class saves; stored normalised, returned with the masked form");
  const ev = DB().auditLog.at(-1);
  assert(DB().auditLog.length === n0 + 1 && ev.type === "guardian.update" && ev.meta.changed.join() === "name,phone" && ev.studentId === maya.id && ev.entity.id === maya.id && !/Tariq|3001234567/.test(JSON.stringify(ev)), "guardian event: field names only, never the name or the number");
  assert(EV.describeEvent(ev, { users: { [maya.id]: "Maya Okafor" } }) === "Changed parent contact name and phone of Maya Okafor." && AU.AUDIT_TYPES["guardian.update"], "guardian event: readable in the audit explorer");
  await GU.saveGuardian(maya.id, { name: "Mr. Tariq Mahmood", phone: "+92 300 1234567" });
  assert(DB().auditLog.length === n0 + 1, "guardian: saving the same values logs nothing");
  g = await GU.saveGuardian(maya.id, { phone: "0321 7654321" });
  assert(g.name === "Mr. Tariq Mahmood" && g.phone === "923217654321" && DB().auditLog.at(-1).meta.changed.join() === "phone", "guardian: only the keys sent change");
  let e = await code(() => GU.saveGuardian(maya.id, { phone: "042-3576123" }));
  assert(e?.status === 400 && e.code === "INVALID_GUARDIAN" && (await get(`/students/${maya.id}/guardian`)).phone === "923217654321", "guardian: a landline → 400 INVALID_GUARDIAN, nothing changed");
  e = await code(() => GU.saveGuardian(maya.id, { name: "x", role: "admin" })); assert(e?.status === 400 && e.code === "INVALID_GUARDIAN", "guardian: unknown fields → 400");
  e = await code(() => GU.saveGuardian("nobody", { name: "x" })); assert(e?.status === 404, "guardian: unknown student → 404");
  // ── scope
  await asEmail("d.osei@westfield.edu", "teacher");
  e = await code(() => get(`/students/${maya.id}/guardian`)); let e2 = await code(() => GU.saveGuardian(maya.id, { name: "Mallory" }));
  assert(e?.status === 404 && e2?.status === 404 && DB().users.find((u) => u.id === maya.id).guardianName === "Mr. Tariq Mahmood", "guardian: a teacher of another class gets 404 (read and write)");
  await as("student"); e = await code(() => get(`/students/${maya.id}/guardian`)); e2 = await code(() => GU.saveGuardian(maya.id, { name: "x" }));
  assert(e?.status === 403 && e2?.status === 403, "guardian: a student gets 403 (even for their own record)");
  // ── no leaks
  const leak = (x) => /guardian|923217654321|Tariq/.test(JSON.stringify(x));
  await as("student"); const mine = await get("/profile"); const me = await fetchMe();
  await as("teacher"); const detail = await get(`/analytics/students/${maya.id}?classId=cls-11a&subjectId=sub-phys-11a`); const hist = await get(`/analytics/students/${maya.id}/history`);
  await as("admin"); const list = await get("/users"); const prof = await get("/profile"); const roster = await get("/classes/cls-11a/roster");
  assert(![mine, me, detail, hist, roster, list, prof, cls].some(leak), "guardian: the number and name appear in no other payload (profile, lists, roster, analytics, history)");
  g = await get(`/students/${maya.id}/guardian`); assert(g.phone === "923217654321", "guardian: an admin can read it");
  // ── create account
  const cid = (await get("/classes")).find((c) => c.code === "11A").id; const before = DB().users.length; const nLog = DB().auditLog.length;
  e = await code(() => AD.createUser({ name: "Bad Contact", email: "bad.contact@westfield.edu", role: "student", classId: cid, guardianPhone: "12345" }));
  assert(e?.status === 400 && e.code === "INVALID_GUARDIAN" && DB().users.length === before && DB().auditLog.length === nLog, "create student: a bad contact → 400, no account and no event");
  e = await code(() => AD.createUser({ name: "Teach Er", email: "teach.er@westfield.edu", role: "teacher", guardianName: "x" })); assert(e?.status === 400 && DB().users.length === before, "create teacher: a parent contact is refused");
  const kid = await AD.createUser({ name: "New Kid", email: "new.kid@westfield.edu", role: "student", classId: cid, guardianName: "Mrs Kid", guardianPhone: "+92 333 1234567" });
  const log = DB().auditLog.slice(-2);
  assert(!leak(kid) && (await get(`/students/${kid.id}/guardian`)).phone === "923331234567" && log.map((x) => x.type).join() === "user.create,guardian.update" && log[1].meta.changed.join() === "name,phone" && !/Mrs Kid|3331234567/.test(JSON.stringify(log)), "create student: contact saved with the account (two events, no values); the response does not echo it");
  const plain = await AD.createUser({ name: "Plain Kid", email: "plain.kid@westfield.edu", role: "student", classId: cid });
  assert(DB().auditLog.at(-1).type === "user.create" && (await get(`/students/${plain.id}/guardian`)).masked === "", "create student: no contact → no guardian event");
  await AD.deleteUser(kid.id);
  assert(!DB().users.some((u) => u.id === kid.id) && !JSON.stringify(DB()).includes("923331234567"), "delete account: the parent contact goes with it");
  assert(AU.verifyChain(DB().auditLog).ok, "audit chain still verifies after the F12c1 events");
  // ── wiring
  const card = src("src/components/guardian/ParentContact.jsx"), sp = src("src/components/teacher-analytics/StudentProfile.jsx"), au = src("src/pages/AdminUsers.jsx"), cm = src("src/components/admin-users/CreateAccountModal.jsx");
  assert(/ParentContactCard/.test(sp) && /no-print/.test(card) && /ParentContactDialog/.test(au) && /guardianPhone/.test(cm) && /inputMode="tel"/.test(card) && /dir="ltr"/.test(card) && /masked/.test(card), "wiring: teacher card (not printed), admin row dialog, create form, phone box is left-to-right, masked in the read view");
  resetMockData();
}

// ── F12c2: parent summary text + saved style ──
{
  const SM = await import("@/lib/summary"); const SS = await import("@/lib/summarySample"); const CT = await import("@/lib/contact"); const RP = await import("@/lib/report"); const PF = await import("@/lib/profile"); const AP = await import("@/api/profile");
  const { resetMockData, db: DB } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  const asEmail = async (email, role) => { const s = await login({ email, password: "x", role }); client.setAuthToken(s.token); return s.user; };
  const D = SM.DEFAULT_SUMMARY_PREFS; const R = SS.sampleReport("en"); const B = (prefs = {}, report = R, ctx = SS.SAMPLE_CONTEXT) => SM.buildSummaryText(report, { ...D, ...prefs }, ctx);
  const ALL = ["result", "trend", "strong", "weak", "comment"]; const STD = { length: "standard", sections: ALL };
  // ── builder
  let r = B();
  assert(D.language === "en" && D.length === "short" && D.emoji === false && r.level === 0 && r.fits && r.text.length <= SM.SHORT_MAX, "summary: defaults are English, short, no emoji, and within 600 characters");
  assert(/^Assalam o Alaikum Mr\. Tariq,\n\*Sample Student\* · 10A · Physics · /.test(r.text) && /Average: 78% \(3 tests\)/.test(r.text) && /Trend: Improving/.test(r.text) && /Needs more work: Wave Optics 48%/.test(r.text) && /_Teacher's comment:_ Good progress/.test(r.text) && /Regards\nYour name$/.test(r.text), "summary: greeting with the parent's name, bold name line, average, trend, weakest topic, italic comment label, closing with the teacher's name");
  assert(!/Class average|Strong topics|Thermodynamics/.test(r.text), "summary: short leaves out class average, strong topics and the second weak topic");
  for (const [id, re] of [["result", /Average:/], ["trend", /Trend:/], ["weak", /Needs more work/], ["comment", /Teacher's comment/], ["strong", /Strong topics/]]) {
    const on = B({ ...STD, sections: ALL }).text; const off = B({ ...STD, sections: ALL.filter((x) => x !== id) }).text;
    assert(re.test(on) && !re.test(off), `summary: section "${id}" can be switched off`);
  }
  const std = B(STD).text;
  assert(/Class average: 71%/.test(std) && /Strong topics: Kinematics 92%, Energy 80%/.test(std) && /Needs more work: Wave Optics 48%, Thermodynamics 62%/.test(std) && std.length <= SM.STANDARD_MAX, "summary: standard adds class average and up to 3 topics per list");
  const emo = B({ ...STD, emoji: true }).text;
  assert(/📊 Average/.test(emo) && /📈 Trend/.test(emo) && /✅ Strong/.test(emo) && /📌 Needs/.test(emo) && /💬 _Teacher/.test(emo) && !/[📊📈✅📌💬]/u.test(std), "summary: icons only when switched on");
  const ur = SM.buildSummaryText(SS.sampleReport("ur"), { ...D, language: "ur" }, SS.SAMPLE_CONTEXT).text;
  assert(/^السلام علیکم/.test(ur) && /اوسط: 78% \(3 ٹیسٹ\)/.test(ur) && /رجحان: بہتری/.test(ur) && /مزید محنت درکار:/.test(ur) && /والسلام\nYour name$/.test(ur) && !/Average|Trend|Regards/.test(ur), "summary: Urdu uses the Urdu labels and no English ones");
  const both = SM.buildSummaryText(SS.sampleReport("en"), { ...D, language: "both" }, SS.SAMPLE_CONTEXT).text;
  assert(/Average: 78%/.test(both) && /اوسط: 78%/.test(both) && both.split("Good progress").length === 2 && both.split("Sample Student").length === 2 && both.split("Regards").length === 2, "summary: English + Urdu gives both blocks, with the name, the comment and the closing once");
  assert(B({ greeting: "Dear parent", signoff: "Thank you" }).text.startsWith("Dear parent Mr. Tariq,") && /Thank you\nYour name$/.test(B({ greeting: "Dear parent", signoff: "Thank you" }).text) && !/Mr\. Tariq/.test(B({}, R, {}).text) && !/Your name/.test(B({}, R, { parentName: "X" }).text), "summary: own greeting and closing; parent and teacher names only when given");
  // formatting safety and trimming
  const odd = { ...R, header: { ...R.header, student: { ...R.header.student, name: "A*B_C~D" } } };
  assert(B({}, odd).text.includes("*ABCD*") && !/[_~`]/.test(B({}, odd).text.replace(/_Teacher's comment:_/, "")), "summary: *, _ and ~ in names cannot break the WhatsApp formatting");
  const longComment = { ...R, comment: "word ".repeat(400) }; r = B({}, longComment);
  assert(r.text.length <= SM.SHORT_MAX && r.fits && /…\n\nRegards/.test(r.text) && r.level === 0, "summary: a very long comment is cut at a word with … and the message stays within 600 characters");
  const longUr = { ...SS.sampleReport("ur"), comment: "ا".repeat(900) }; r = SM.buildSummaryText(longUr, { ...D, ...STD, language: "ur" }, SS.SAMPLE_CONTEXT);
  assert(r.fits && CT.fitsWhatsApp(r.text) && r.level >= 1 && r.text.length < 400, "summary: Urdu text is trimmed until it fits one WhatsApp link");
  const huge = { ...R, topics: { strong: [], weak: Array.from({ length: 3 }, (_, i) => ({ name: "T".repeat(700) + i, accuracy: 10 })) }, comment: "x".repeat(900) }; r = B({ ...STD, length: "short" }, huge);
  assert(r.level === 3 && r.text.length <= SM.SHORT_MAX && /Average: 78%/.test(r.text) && !/Teacher's comment|Regards/.test(r.text), "summary: worst case falls back to the result only, still within the cap");
  const empty = RP.buildReport({ student: { id: "s", name: "Nova", cls: "10A", roll: "10A-02" }, preset: "weekly", period: RP.resolvePeriod("last7", {}, Date.UTC(2026, 10, 18)), rows: [], options: { ...RP.DEFAULT_REPORT_OPTIONS, comment: "Hi" }, now: Date.UTC(2026, 10, 18) });
  r = B({}, empty); assert(/No confirmed marks in this period yet\./.test(r.text) && !/Average|Trend|%/.test(r.text) && /\*Nova\*/.test(r.text), "summary: no confirmed marks → says so, no numbers");
  const tr = (n) => ({ testId: "t" + n, test: "Forces Test", subject: "Physics", at: Date.UTC(2026, 10, 10), marks: 27, max: 30, percent: 90, classAverage: 73 });
  const tReport = RP.buildReport({ student: { id: "s", name: "Nova", cls: "10A", roll: "10A-02" }, preset: "test", period: { key: "test", from: 0, to: 0 }, rows: [tr(1)], topics: [{ name: "Wave Optics", accuracy: 50 }], questions: [], options: RP.DEFAULT_REPORT_OPTIONS, now: Date.UTC(2026, 10, 18) });
  const tt = B(STD, tReport).text; assert(/Score: 27\/30 \(90%\) · Class average: 73%/.test(tt) && !/Trend/.test(tt) && /Forces Test/.test(tReport.tests[0].title), "summary: a test report gives the score and the class average, no trend");
  assert(JSON.stringify(R) === JSON.stringify(SS.sampleReport("en")) && B(STD).text === B(STD).text, "summary: pure (same input, same text; the report is not changed)");
  assert(!/\d{9,}|guardian|flag|http/i.test(B(STD).text), "summary: no phone numbers, flags or links in the text");
  // ── style rules
  assert(JSON.stringify(SM.normalizeSummaryPrefs(null)) === JSON.stringify(D) && JSON.stringify(SM.normalizeSummaryPrefs("x")) === JSON.stringify(D) && JSON.stringify(SM.normalizeSummaryPrefs({ sections: ["comment", "nope", "result"], language: "fr", length: "huge", emoji: "yes", greeting: " Hi\n  there\t", signoff: "x".repeat(99) })) === JSON.stringify({ sections: ["result", "comment"], language: "en", greeting: "Hi there", signoff: "x".repeat(60), emoji: false, length: "short" }), "style: anything → a complete valid style (junk dropped, canonical order, text tidied and capped)");
  const vs = SM.validateSummaryPrefs;
  assert(vs({}) === null && vs(D) === null && vs({ language: "both", emoji: true, sections: [] }) === null && vs(null)._ && vs([])._ && vs({ extra: 1 })._ && vs({ language: "fr" }).language && vs({ length: "x" }).length && vs({ emoji: "yes" }).emoji && vs({ sections: ["result", "result"] }).sections && vs({ sections: ["nope"] }).sections && vs({ greeting: "x".repeat(61) }).greeting && vs({ signoff: 4 }).signoff && PF.validateProfilePatch({ prefs: { parentSummary: { language: "fr" } } }).prefs && PF.validateProfilePatch({ prefs: { parentSummary: D } }) === null && PF.validateProfilePatch({ prefs: { parentSummary: null } }) === null, "style: strict validation (unknown keys, wrong values, duplicate sections, long text) and the profile rules call it");
  // ── saved per teacher
  resetMockData(); await asEmail("r.chen@westfield.edu", "teacher");
  const style = { ...D, language: "both", length: "standard", emoji: true, greeting: "Dear", sections: ["result", "weak"] }; const n0 = DB().auditLog.length;
  let p = await AP.updateProfile({ prefs: { parentSummary: style } });
  assert(JSON.stringify(SM.normalizeSummaryPrefs(p.prefs.parentSummary)) === JSON.stringify(style) && JSON.stringify(SM.normalizeSummaryPrefs((await get("/profile")).prefs.parentSummary)) === JSON.stringify(style), "style: saved for the teacher and read back");
  const ev = DB().auditLog.at(-1); assert(DB().auditLog.length === n0 + 1 && ev.type === "profile.update" && ev.meta.changed.join() === "prefs" && !/Dear|both|standard/.test(JSON.stringify(ev)), "style: logged as 'prefs changed' only, never the wording");
  await AP.updateProfile({ prefs: { parentSummary: style } }); assert(DB().auditLog.length === n0 + 1, "style: saving the same style logs nothing");
  let e = await code(() => AP.updateProfile({ prefs: { parentSummary: { language: "fr" } } }));
  assert(e?.status === 400 && e.code === "INVALID_PROFILE" && (await get("/profile")).prefs.parentSummary.language === "both", "style: an invalid style → 400, the saved one is kept");
  await AP.updateProfile({ prefs: { theme: "dark" } }); p = await get("/profile");
  assert(p.prefs.theme === "dark" && p.prefs.parentSummary.greeting === "Dear", "style: saving another preference keeps the style (top-level merge)");
  await asEmail("d.osei@westfield.edu", "teacher"); p = await get("/profile"); assert(!p.prefs.parentSummary, "style: another teacher does not get it");
  await as("student"); e = await code(() => AP.updateProfile({ prefs: { parentSummary: D } })); assert(e?.status === 400 && e.code === "INVALID_PROFILE", "style: a student cannot set a parent message style");
  await asEmail("r.chen@westfield.edu", "teacher"); p = await AP.updateProfile({ prefs: { parentSummary: null } }); assert(!("parentSummary" in p.prefs), "style: null removes it (back to the defaults)");
  // ── wiring
  const pg = src("src/pages/Profile.jsx"), ui = src("src/components/profile/ParentMessageStyle.jsx");
  assert(/ParentMessageStyle/.test(pg) && /role === "teacher"/.test(pg) && /aria-live="polite"/.test(ui) && /of \{cap\} characters/.test(ui) && /maxLength=\{GREETING_MAX\}/.test(ui) && /parentSummary: draft/.test(ui) && /sampleReport/.test(ui), "wiring: teacher-only section on the Profile page with a live preview, character counter and capped inputs");
  resetMockData();
}

// ── F12d: share dialog + send queue ──
{
  const SQ = await import("@/lib/shareQueue"); const RP = await import("@/api/reports"); const GU = await import("@/api/guardian"); const CT = await import("@/lib/contact"); const SM = await import("@/lib/summary");
  const { resetMockData, db: DB } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  const asEmail = async (email, role) => { const s = await login({ email, password: "x", role }); client.setAuthToken(s.token); return s.user; };
  // ── pure rules
  const cls = ["a", "b", "c", "d"];
  assert(JSON.stringify(SQ.resolveAudience({ audience: "student", studentId: "b", classIds: cls })) === '["b"]' && SQ.resolveAudience({ audience: "student", studentId: "zzz", classIds: cls }).length === 0 && SQ.resolveAudience({ audience: "student", studentId: null, classIds: cls }).length === 0, "audience: one student, only if in the class");
  assert(JSON.stringify(SQ.resolveAudience({ audience: "selected", selectedIds: ["d", "other-class", "a"], classIds: cls })) === '["a","d"]' && JSON.stringify(SQ.resolveAudience({ audience: "class", classIds: cls })) === '["a","b","c","d"]', "audience: ticked rows in class order (other classes ignored); whole class");
  const ok = { ids: ["a"], preset: "weekly", period: "last7" };
  assert(SQ.validateShare(ok) === null && SQ.validateShare({ ...ok, ids: [] }) && SQ.validateShare({ ...ok, ids: Array.from({ length: 61 }, (_, i) => "s" + i) }) && SQ.validateShare({ ...ok, ids: Array.from({ length: 60 }, (_, i) => "s" + i) }) === null && SQ.validateShare({ ...ok, preset: "x" }) && SQ.validateShare({ ...ok, period: "custom" }) && SQ.validateShare({ ids: ["a"], preset: "test", testId: "" }) && SQ.validateShare({ ids: ["a"], preset: "test", testId: "t1" }) === null && SQ.QUEUE_MAX === 60, "share check: needs someone, at most 60, a known report type, period or test");
  const text = "hello", fine = { text, fits: true };
  assert(SQ.queueRowState({ phone: "0300-1234567", built: null }) === "loading" && SQ.queueRowState({ phone: "", built: fine }) === "no-number" && SQ.queueRowState({ phone: "042-1234567", built: fine }) === "no-number" && SQ.queueRowState({ phone: undefined, built: fine }) === "no-number" && SQ.queueRowState({ phone: "923001234567", built: fine }) === "ready" && SQ.queueRowState({ phone: "923001234567", built: { text, fits: false } }) === "too-long" && SQ.queueRowState({ phone: "923001234567", built: { text: "a".repeat(2100), fits: true } }) === "too-long" && SQ.queueRowState({ phone: "", built: { text, fits: false } }) === "no-number", "queue row: loading, no number (wins over too long), too long → copy, ready");
  const at = new Date(2026, 10, 17, 10, 42).getTime();
  assert(/^Opened .*42/.test(SQ.doneLabel({ at, how: "opened" })) && /^Copied/.test(SQ.doneLabel({ at, how: "copied" })) && SQ.doneLabel(undefined) === "" && SQ.progressLabel(28, 12) === "12 of 28 opened" && !/sent/i.test(SQ.doneLabel({ at, how: "opened" })), "queue labels: Opened/Copied with the time, never 'sent'; progress '12 of 28 opened'");
  assert(/outside Vellum/.test(SQ.SHARE_NOTICE) && /never post reports in a group/.test(SQ.SHARE_NOTICE) && /18 or over/.test(SQ.SHARE_NOTICE) && SQ.SKIP_REASONS.no_marks && SQ.SKIP_REASONS.not_ready, "queue notice: outside Vellum, never in a group, consent for 18+");
  // ── saved queue (sessionStorage; ids only)
  const fake = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
  const sq = { batch: { reports: [{ studentId: "a", reportId: "r1", generatedAt: 1 }], skipped: [{ studentId: "b", reason: "no_marks" }] }, request: { preset: "weekly", period: "last7", from: 1, to: 2, testId: "" }, done: { r1: { at: 5, how: "opened" } } };
  const st = fake(); SQ.saveQueue(sq, st); const back = SQ.loadQueue(Date.now(), st);
  assert(JSON.stringify(back) === JSON.stringify(sq) && !/Tariq|name|"phone"|wa\.me|92\d{10}/.test(st.m.get(SQ.QUEUE_KEY)), "saved queue: comes back as saved, report and student ids only");
  assert(SQ.loadQueue(Date.now() + 13 * 3_600_000, st) === null && SQ.loadQueue(Date.now(), fake()) === null && (() => { const x = fake(); x.setItem(SQ.QUEUE_KEY, "{oops"); return SQ.loadQueue(Date.now(), x); })() === null && (() => { const x = fake(); x.setItem(SQ.QUEUE_KEY, JSON.stringify({ batch: {}, request: {}, savedAt: Date.now() })); return SQ.loadQueue(Date.now(), x); })() === null, "saved queue: nothing, too old (12 hours), broken or the wrong shape → null");
  assert((() => { try { SQ.saveQueue(sq, { setItem: () => { throw new Error("full"); } }); return true; } catch { return false; } })() && SQ.loadQueue(Date.now(), { getItem: () => { throw new Error("blocked"); } }) === null, "saved queue: a full or blocked storage never throws");
  // ── batch endpoint
  resetMockData(); await asEmail("r.chen@westfield.edu", "teacher");
  const analytics = await get("/analytics/class?classId=cls-11a&subjectId=sub-phys-11a"); const ids = analytics.students.map((s) => s.id); const testId = analytics.trend[0].testId;
  const wide = { studentIds: ids, preset: "weekly", period: "thisMonth", from: Date.now() - 400 * 86_400_000, to: Date.now(), language: "en" };
  const maya = ids[0]; await GU.saveGuardian(maya, { name: "Mr. Tariq Mahmood", phone: "0300-1234567" });
  let r0 = DB().reports?.length ?? 0, l0 = DB().auditLog.length;
  let b = await RP.createReportBatch(wide);
  const made = b.reports.length;
  assert(made > 0 && made + b.skipped.length === ids.length && b.reports.every((x) => ids.includes(x.studentId) && x.reportId) && b.skipped.every((x) => ["no_marks", "not_ready"].includes(x.reason)) && new Set([...b.reports, ...b.skipped].map((x) => x.studentId)).size === ids.length, "batch: every student is either made or skipped with a reason, once");
  const evs = DB().auditLog.slice(l0);
  assert(DB().reports.length === r0 + made && DB().reports.slice(-made).every((s) => s.createdBy === DB().users.find((u) => u.email === "r.chen@westfield.edu").id && s.contentHash) && evs.length === made && evs.every((e) => e.type === "report.generate" && e.meta.batch === true && e.meta.preset === "weekly" && e.studentId === e.meta.studentId), "batch: one snapshot and one report.generate event per student made");
  assert(!/Tariq|3001234567|marks|comment|text/i.test(JSON.stringify(evs)), "batch: events carry no number, name, marks, comment or text");
  r0 = DB().reports.length;
  const dup = await RP.createReportBatch({ ...wide, studentIds: [maya, maya, maya] });
  assert(dup.reports.length + dup.skipped.length === 1 && DB().reports.length - r0 === dup.reports.length, "batch: repeated ids count once");
  r0 = DB().reports.length; l0 = DB().auditLog.length;
  let e = await code(() => RP.createReportBatch({ ...wide, studentIds: Array.from({ length: 61 }, (_, i) => "s" + i) }));
  assert(e?.status === 400 && e.code === "INVALID_REPORT" && DB().reports.length === r0 && DB().auditLog.length === l0, "batch: 61 students → 400, nothing made");
  e = await code(() => RP.createReportBatch({ ...wide, studentIds: [] })); assert(e?.status === 400 && e.code === "INVALID_REPORT", "batch: nobody → 400");
  e = await code(() => RP.createReportBatch({ ...wide, preset: "yearly" })); assert(e?.status === 400 && DB().reports.length === r0, "batch: unknown report type → 400, nothing made");
  const mine = new Set((await get("/classes")).map((c) => c.id)); const other = DB().users.find((u) => u.role === "student" && !mine.has(u.classId)); assert(!!other, "batch: fixture has a student in a class this teacher does not teach");
  e = await code(() => RP.createReportBatch({ ...wide, studentIds: [maya, other.id] }));
  assert(e?.status === 404 && DB().reports.length === r0 && DB().auditLog.slice(l0).every((x) => x.type !== "report.generate"), "batch: one student outside the teacher's classes → 404 for the whole call, nothing made");
  const old = await RP.createReportBatch({ ...wide, from: Date.parse("2020-01-01"), to: Date.parse("2020-02-01") });
  assert(old.reports.length === 0 && old.skipped.length === ids.length && old.skipped.every((x) => x.reason === "no_marks") && DB().reports.length === r0 && DB().auditLog.slice(l0).every((x) => x.type !== "report.generate"), "batch: a period with no marks → everyone skipped, nothing made");
  const t = await RP.createReportBatch({ studentIds: ids, preset: "test", testId });
  assert(t.reports.length + t.skipped.length === ids.length && t.reports.length > 0 && DB().auditLog.slice(-t.reports.length).every((x) => x.meta.preset === "test"), "batch: a test report for the class (students without a released final result are skipped)");
  e = await code(() => RP.createReportBatch({ studentIds: ids, preset: "test", testId: "nope" })); assert(e?.status === 404, "batch: unknown test → 404");
  // exported
  l0 = DB().auditLog.length; const rid = b.reports[0].reportId;
  await RP.markReportExported(rid, "whatsapp"); await RP.markReportExported(rid, "copy");
  const ex = DB().auditLog.slice(l0); assert(ex.length === 2 && ex.every((x) => x.type === "report.export") && ex.map((x) => x.meta.channel).join() === "whatsapp,copy" && !/Tariq|3001234567/.test(JSON.stringify(ex)), "queue: Open and Copy are logged as export with the channel only");
  await asEmail("d.osei@westfield.edu", "teacher"); e = await code(() => RP.markReportExported(rid, "whatsapp")); let e2 = await code(() => RP.createReportBatch({ ...wide, studentIds: [maya] }));
  assert(e?.status === 404 && e2?.status === 404, "batch: another teacher cannot export or batch this class");
  await as("student"); e = await code(() => RP.createReportBatch(wide)); await as("admin"); let e3 = await code(() => RP.createReportBatch(wide)); assert(e?.status === 403 && e3?.status === 403, "batch: students and admins get 403");
  // queue text end to end: data → report → text → link
  await asEmail("r.chen@westfield.edu", "teacher");
  const data = await RP.getReportData({ studentId: maya, preset: "weekly", period: "thisMonth", from: wide.from, to: wide.to });
  const RPT = await import("@/lib/report"); const report = RPT.buildReport({ student: data.student, preset: "weekly", period: { key: "thisMonth", from: wide.from, to: wide.to }, subjectName: data.subjectName, rows: data.rows, topics: data.topics, questions: data.questions, excluded: data.excluded, options: { sections: Object.fromEntries(RPT.REPORT_SECTIONS.map((s) => [s.id, true])), comment: "", language: "en" }, now: Date.now() });
  const gd = await get(`/students/${maya}/guardian`); const built = SM.buildSummaryText(report, null, { parentName: gd.name, teacherName: "R. Chen" });
  const link = CT.toWaLink(gd.phone, built.text);
  assert(SQ.queueRowState({ phone: gd.phone, built }) === "ready" && link.startsWith("https://wa.me/923001234567?text=") && decodeURIComponent(link.split("?text=")[1]) === built.text && /Mr\. Tariq Mahmood/.test(built.text) && built.text.includes(data.student.name), "queue: a real student's message opens a wa.me link carrying exactly the previewed text");
  // ── wiring
  const dlg = src("src/components/teacher-report/ShareDialog.jsx"), q = src("src/components/teacher-report/SendQueue.jsx"), pg = src("src/pages/TeacherShareQueue.jsx"), rt = src("src/routes/index.jsx"), ov = src("src/components/teacher-analytics/AnalyticsOverview.jsx"), sp = src("src/components/teacher-analytics/StudentProfile.jsx");
  assert(/Save PDF/.test(dlg) && /Send on WhatsApp/.test(dlg) && /Whole class/.test(dlg) && /Selected students/.test(dlg) && /This student/.test(dlg) && /createReportBatch/.test(dlg) && /state: \{ order: ids \}/.test(dlg), "wiring: share dialog (who, type, period or test, Save PDF → builder with Next student, Send on WhatsApp → queue)");
  assert(/window\.open\(toWaLink\(guardian\.phone, built\.text\), "_blank", "noopener"\)/.test(q) && /Copy text/.test(q) && /Add number/.test(q) && /ParentContactBody/.test(q) && /Open WhatsApp/.test(q) && !/\bsent\b/i.test(q.replace(/\/\/.*$/gm, "")) && /SHARE_NOTICE/.test(q) && /markReportExported\(item\.reportId/.test(q), "wiring: queue opens wa.me in a new tab without opener, copy fallback, inline number edit, never says 'sent'");
  assert(/analytics\/share/.test(rt) && /analytics\/share/.test(dlg) && /loadQueue/.test(pg) && /saveQueue/.test(dlg) && /Share with parents/.test(ov) && /whole class/.test(ov) && /Share report/.test(sp), "wiring: queue route, class-table buttons (ticked rows / whole class), student page button");
  resetMockData();
}

// ── F14: privacy policy ──
{
  const PV = await import("@/lib/privacy"); const IN = await import("@/api/institution"); const EV = await import("@/lib/auditEvents"); const AU = await import("@/lib/audit");
  const { resetMockData, db: DB } = await import("@/mocks/db");
  const fs = await import("node:fs"); const src = (p) => fs.readFileSync(p, "utf8");
  const inst = { name: "Westfield Institute", email: "admin@westfield.edu", city: "Lahore", allowStudentPhotos: false };
  const pad = (s) => "a".repeat(300) + s;
  // ── template and rendering
  const T = PV.PRIVACY_TEMPLATE;
  assert(PV.policyTextProblem(T) === null && T.length > PV.PRIVACY_MIN && T.length < PV.PRIVACY_MAX && !/<\s*[a-zA-Z]/.test(T), "template: valid, within the size limits, no HTML");
  const heads = T.split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
  for (const h of ["What we collect", "Why we use it", "Who can see it", "AI features", "Marks and the audit log", "Parent and guardian contact", "How long we keep it", "Your rights", "Children", "Security", "Changes to this policy", "Contact"]) assert(heads.includes(h), `template: has the section "${h}"`);
  assert(/Vellum does not send the message/.test(T) && /We do not sell personal information/.test(T) && /confirms or changes it before a student sees it/.test(T) && !/\b(GDPR|COPPA|FERPA|compliant|compliance)\b/i.test(T), "template: says WhatsApp is opened by the teacher, no selling, AI marks are drafts, and claims no legal compliance");
  const a = PV.renderPolicy(T, inst);
  assert(a.includes("Westfield Institute (Lahore)") && a.includes("admin@westfield.edu") && !a.includes("{{") && !/profile photo/i.test(a) && !/\n\n\n/.test(a), "render: institution, city and email filled in; the photo line is left out while photos are off");
  const b = PV.renderPolicy(T, { ...inst, allowStudentPhotos: true, email: "", city: "" });
  assert(/A profile photo, only if you or the administrator add one\./.test(b) && !b.includes("{{") && !/ at \./.test(b) && !/\(\)/.test(b) && /ask the administrator\./i.test(b), "render: photos on adds the photo line; no email or city leaves no gaps");
  assert(PV.renderPolicy("Hello {{ institution }} {{unknown}}", {}) === "Hello our institution {{unknown}}\n" && PV.renderPolicy("x {{#photos}}P{{/photos}} y", { allowStudentPhotos: true }) === "x P y\n", "render: spaces inside braces work, an unknown placeholder is left as it is, empty institution has a fallback name");
  // ── what can be saved
  const bad = [[pad("x").slice(0, 199), /too short/], ["a".repeat(20_001), /too long/], [pad("<b>x</b>"), /no HTML/], [pad("<!-- c -->"), /no HTML/], [pad("\n# Title"), /Headings/], [pad("\n### Title"), /Headings/], [pad("\n##Title"), /Headings/], [pad(" {{foo}}"), /Unknown placeholder \{\{foo\}\}/], [pad(" {{#nope}}x{{/nope}}"), /Unknown block/], [pad(" {{#photos}}x"), /not closed/], [pad(" {{/photos}}"), /no matching/], [pad(" {{ institution"), /not closed/], [pad(" \u0007"), /aren't allowed/], [42, /Enter the policy text/]];
  for (const [t, re] of bad) assert(re.test(PV.policyTextProblem(t) ?? ""), `policy check refuses: ${String(t).slice(300, 330) || String(t).slice(0, 20)} → ${re}`);
  assert(PV.policyTextProblem(pad("\n## Title\n- one\n2 < 3 and a<3 {{institution}} {{#city}}{{city}}{{/city}}")) === null && PV.policyTextProblem("ا".repeat(300)) === null, "policy check accepts headings, bullets, a bare < in prose, placeholders, blocks and Urdu text");
  const v = PV.validatePrivacyPatch;
  assert(v({ reviewed: true }) === null && v({ effectiveDate: "" }) === null && v({ effectiveDate: null }) === null && v({ effectiveDate: "2026-11-17" }) === null && v({ text: T }) === null && v({})._ && v(null)._ && v([])._ && v({ version: 5 })._ && v({ text: "x" }).text && v({ effectiveDate: "2026-02-30" }).effectiveDate && v({ effectiveDate: "17/11/2026" }).effectiveDate && v({ reviewed: "yes" }).reviewed && v({ text: pad("<script>") }).text, "patch rules: partial updates, real dates only, boolean reviewed, unknown keys and an empty body refused");
  assert(PV.isValidEffectiveDate("2024-02-29") && !PV.isValidEffectiveDate("2026-02-29") && !PV.isValidEffectiveDate("2026-13-01") && !PV.isValidEffectiveDate(20261117), "dates: leap day yes, impossible days no");
  assert(JSON.stringify(PV.privacyChangedFields({ text: "a", reviewed: false }, { text: "b", reviewed: true })) === '["text","reviewed"]' && PV.privacyChangedFields({}, { effectiveDate: "" }).length === 0 && PV.privacyChangedFields({ effectiveDate: "" }, { effectiveDate: "2026-01-01" }).join() === "effectiveDate", "changed fields: names only; an empty date equals none");
  // ── display blocks (plain text → elements)
  const bl = PV.policyBlocks("## Head\nfirst line\nsecond line\n\n- one\n- two\nafter list\n\n<b>raw</b> & more");
  assert(JSON.stringify(bl) === JSON.stringify([{ type: "h", text: "Head" }, { type: "p", text: "first line second line" }, { type: "ul", items: ["one", "two"] }, { type: "p", text: "after list" }, { type: "p", text: "<b>raw</b> & more" }]), "display: headings, joined lines, bullets; markup stays as plain text");
  // ── views
  const pub = PV.privacyView(null, inst), adm = PV.privacyView(null, inst, { admin: true });
  assert(pub.version === 1 && pub.reviewed === false && pub.effectiveDate === null && !("source" in pub) && adm.isTemplate && adm.source === T && pub.text === adm.text, "view: nothing saved → the template, version 1, not reviewed; only an admin gets the source");
  // ── endpoint
  resetMockData(); client.setAuthToken(null);
  let g = await get("/institution/privacy");
  assert(g.version === 1 && g.reviewed === false && g.text.includes("Westfield Institute") && !g.text.includes("{{") && !("source" in g) && !("isTemplate" in g), "endpoint: anyone can read it before signing in; placeholders are filled; no source for the public");
  for (const role of ["student", "teacher"]) { await as(role); g = await get("/institution/privacy"); assert(!("source" in g) && g.version === 1, `endpoint: a ${role} gets the rendered text only`); }
  await as("admin"); g = await get("/institution/privacy"); assert(g.source === T && g.isTemplate === true, "endpoint: an admin also gets the source and whether it is still the template");
  const l0 = DB().auditLog.length; let e;
  for (const role of ["student", "teacher"]) { await as(role); e = await code(() => IN.updatePrivacy({ reviewed: true })); assert(e?.status === 403 && DB().privacy == null, `endpoint: a ${role} cannot change it (403)`); }
  client.setAuthToken(null); e = await code(() => IN.updatePrivacy({ reviewed: true })); assert(e?.status === 401, "endpoint: signed out cannot change it (401)");
  await as("admin");
  for (const body of [{ text: pad("<b>x</b>") }, { text: "short" }, { effectiveDate: "2026-02-30" }, { reviewed: "yes" }, { version: 9 }, {}, { text: pad(" {{secret}}") }]) { e = await code(() => IN.updatePrivacy(body)); assert(e?.status === 400 && e.code === "INVALID_PRIVACY", `endpoint: ${JSON.stringify(body).slice(0, 40)}… → 400 INVALID_PRIVACY`); }
  assert(DB().privacy == null && DB().auditLog.slice(l0).every((x) => x.type !== "privacy.update"), "endpoint: nothing saved and nothing logged after refused changes");
  g = await IN.updatePrivacy({ reviewed: true });
  assert(g.reviewed === true && g.version === 1 && g.isTemplate === false && g.source === T && DB().auditLog.at(-1).type === "privacy.update" && DB().auditLog.at(-1).meta.changed.join() === "reviewed" && DB().auditLog.at(-1).meta.version === 1, "endpoint: marking it reviewed keeps version 1 and logs `reviewed`");
  const MINE = "## Our promise\nWe keep {{institution}} marks safe and we never share the secret-phrase-zebra with anyone. " + "More words. ".repeat(30) + "\n";
  const n1 = DB().auditLog.length; g = await IN.updatePrivacy({ text: MINE });
  assert(g.version === 2 && g.source === MINE.trim() + "\n" && g.text.includes("Westfield Institute marks safe") && !g.text.includes("{{") && g.reviewed === true && !!g.updatedAt && DB().auditLog.length === n1 + 1, "endpoint: new wording → version 2, text saved trimmed, placeholders filled when read");
  const ev = DB().auditLog.at(-1);
  assert(ev.type === "privacy.update" && ev.meta.changed.join() === "text" && ev.meta.version === 2 && !/secret-phrase-zebra|Our promise/.test(JSON.stringify(ev)) && EV.describeEvent(ev, {}) === "Changed the privacy policy text (version 2)." && AU.AUDIT_TYPES["privacy.update"], "audit: `text` and the version number only, never the wording; readable in the explorer");
  await IN.updatePrivacy({ text: MINE.trim() + "\n\n\n" }); await IN.updatePrivacy({ reviewed: true }); assert(DB().auditLog.length === n1 + 1 && (await get("/institution/privacy")).version === 2, "endpoint: the same wording or the same flag again → no new version, no event");
  g = await IN.updatePrivacy({ effectiveDate: "2026-12-01" }); assert(g.version === 2 && g.effectiveDate === "2026-12-01" && DB().auditLog.at(-1).meta.changed.join() === "effectiveDate", "endpoint: an effective date does not make a new version");
  g = await IN.updatePrivacy({ effectiveDate: "" }); assert(g.effectiveDate === null && DB().auditLog.at(-1).meta.changed.join() === "effectiveDate", "endpoint: the date can be cleared");
  g = await IN.updatePrivacy({ reviewed: false, text: T }); assert(g.version === 3 && g.reviewed === false && DB().auditLog.at(-1).meta.changed.join() === "text,reviewed", "endpoint: text and reviewed together → both logged, back on the template is still a new version");
  // placeholders follow the institution settings
  const { updateInstitution } = IN; await updateInstitution({ name: "Greenfield High School", city: "Islamabad", email: "office@greenfield.edu", allowStudentPhotos: true });
  client.setAuthToken(null); g = await get("/institution/privacy");
  assert(g.text.includes("Greenfield High School (Islamabad)") && g.text.includes("office@greenfield.edu") && /A profile photo/.test(g.text) && !g.text.includes("Westfield"), "endpoint: renaming the institution, its email or the photo setting changes the public text without re-saving the policy");
  await as("admin"); assert(AU.verifyChain(DB().auditLog).ok, "audit chain verifies after the F14 events");
  // ── wiring
  const rt = src("src/routes/index.jsx"), pg = src("src/pages/Privacy.jsx"), ed = src("src/components/admin-institution/PrivacyPolicyEditor.jsx"), doc = src("src/components/privacy/PolicyDocument.jsx"), lg = src("src/pages/Login.jsx"), pf = src("src/pages/Profile.jsx"), sb = src("src/layout/Sidebar.jsx"), ai = src("src/pages/AdminInstitution.jsx");
  assert(rt.indexOf('path: "/privacy"') > 0 && rt.indexOf('path: "/privacy"') < rt.indexOf('path: "/",\n') && !/RequireAuth[^]{0,40}Privacy/.test(rt), "wiring: /privacy is a public route (outside the signed-in layout)");
  assert([lg, pf, sb].every((s) => /to="\/privacy"/.test(s)) && /PrivacyPolicyEditor/.test(ai), "wiring: privacy link on the sign-in page, every profile and the sidebar; editor on the Institution page");
  assert(![pg, ed, doc].some((s) => /dangerouslySetInnerHTML|innerHTML/.test(s)), "wiring: the policy is never inserted as HTML");
  assert(/Draft\. This wording is a template, not legal advice/.test(ed) && /legal adviser has reviewed/.test(ed) && /Start from the template/.test(ed) && /aria-label="Privacy policy text"/.test(ed) && /Preview/.test(ed) && /The institution has not confirmed this policy yet/.test(pg) && /window\.print\(\)/.test(pg) && /no-print/.test(pg), "wiring: draft banner until reviewed, template reset (asks first), preview, plain-text hint, public page notice and print");
  resetMockData(); client.setAuthToken(null);
}
