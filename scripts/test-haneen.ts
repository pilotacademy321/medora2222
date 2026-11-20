import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {
  buildInstantGentleTopicReply,
  detectEmergencySymptoms,
  detectGreetingOrThanks,
  detectMedicationDosageRequest,
  loadDefaultKnowledgeSources,
  retrieveRelevantKnowledge,
} from '../server/haneenKnowledge.ts';
import { HaneenStore } from '../server/haneenStore.ts';
import { createAdminHaneenRouter, createHaneenRouter } from '../server/haneenRoutes.ts';

async function runTests() {
  const tempFile = path.join(os.tmpdir(), `haneen-test-${Date.now()}.json`);
  const store = new HaneenStore({ filePath: tempFile });

  console.log('1) Checking loaded medical knowledge sources (01..04 ONLY, excluding 00_README & 05_PROMPT)...');
  const sources = store.getKnowledgeSources();
  assert.equal(sources.length, 4, 'Expected exactly 4 medical knowledge sources (01..04)');
  for (const s of sources) {
    assert.ok(s.content.length > 500, `Source ${s.code} should have loaded content`);
    assert.ok(!s.originFile?.includes('00_README'), '00_README must NOT be in knowledge base');
    assert.ok(!s.originFile?.includes('05_HANEEN_AI_STUDIO_BUILD_PROMPT'), '05_PROMPT must NOT be in knowledge base');
  }

  console.log('2) Testing deterministic Emergency Red Flags Gate...');
  const emergencyInputs = [
    'أشعر بألم شديد في الصدر مع تعرق وضيق تنفس',
    'والدي عنده تدلّي الوجه وثقل اللسان فجأة',
    'لدي نزيف شديد لا يتوقف',
    'طفلي فاقد الوعي ولا يستجيب',
    'severe chest pain and shortness of breath',
  ];
  for (const txt of emergencyInputs) {
    const res = detectEmergencySymptoms(txt);
    assert.equal(res.isEmergency, true, `Should trigger emergency for: ${txt}`);
  }
  const nonEmergency = detectEmergencySymptoms('ما معنى MCV في تحليل CBC؟');
  assert.equal(nonEmergency.isEmergency, false, 'Routine CBC question must not trigger emergency');

  console.log('3) Testing Medication / Dosage Refusal Gate...');
  const medQuestions = [
    'كم جرعة الإنسولين التي أحتاجها لأن سكري 190؟',
    'هل أوقف دواء الضغط اليوم؟',
    'اوصفلي مضاد حيوي مناسب لالتهاب البول',
    'What dose of antibiotic should I take?',
  ];
  for (const q of medQuestions) {
    assert.equal(detectMedicationDosageRequest(q), true, `Should refuse dosage/prescription request: ${q}`);
  }

  console.log('4) Testing Knowledge Retrieval & Citations for CBC / HbA1c / WHO Diet...');
  const cbcMatch = retrieveRelevantKnowledge(sources, 'ما معنى HbA1c وما الفرق عن سكر الدم؟');
  assert.ok(cbcMatch.citations.some((c) => c.code === '02'), 'HbA1c query should retrieve Source 02');
  assert.ok(cbcMatch.citations[0].sourceUrl.startsWith('https://'), 'Citations must include valid URL');

  const whoMatch = retrieveRelevantKnowledge(sources, 'ما هي مبادئ الغذاء الصحي وفق منظمة الصحة العالمية؟');
  assert.ok(whoMatch.citations.some((c) => c.code === '03'), 'Healthy diet query should retrieve Source 03');

  console.log('5) Testing Patient Isolation, Consent Gate, Non-Patient Block & Admin Privacy via Live HTTP...');
  const mockTokens: Record<
    string,
    { uid: string; email: string; email_verified: boolean; portal: 'patient' | 'doctor' | 'lab' | 'admin' }
  > = {
    'tok-patient-a': { uid: 'patient_A', email: 'a@example.com', email_verified: true, portal: 'patient' },
    'tok-patient-b': { uid: 'patient_B', email: 'b@example.com', email_verified: true, portal: 'patient' },
    'tok-doctor': { uid: 'doc_1', email: 'doc@example.com', email_verified: true, portal: 'doctor' },
    'tok-lab': { uid: 'lab_1', email: 'lab@example.com', email_verified: true, portal: 'lab' },
    'tok-admin': { uid: 'admin_1', email: 'aqbs250@gmail.com', email_verified: true, portal: 'admin' },
  };

  const mockRestDb = {
    async getDoc(_token: string, docPath: string) {
      if (docPath === 'users/patient_A') return { uid: 'patient_A', selectedPortal: 'patient', accountStatus: 'active', dateOfBirth: '1995-05-01', gender: 'female' };
      if (docPath === 'patient_profiles/patient_A') return { uid: 'patient_A', fullName: 'مريضة أ', status: 'active', dateOfBirth: '1995-05-01', gender: 'female' };
      if (docPath === 'users/patient_B') return { uid: 'patient_B', selectedPortal: 'patient', accountStatus: 'active' };
      if (docPath === 'patient_profiles/patient_B') return { uid: 'patient_B', fullName: 'مريض ب', status: 'active' };
      if (docPath === 'users/doc_1') return { uid: 'doc_1', selectedPortal: 'doctor', accountStatus: 'active' };
      if (docPath === 'users/lab_1') return { uid: 'lab_1', selectedPortal: 'lab', accountStatus: 'active' };
      if (docPath === 'lab_results/res_of_A') {
        return {
          resultId: 'res_of_A',
          patientUid: 'patient_A',
          labNameAr: 'مختبر النخبة',
          reportNumber: 'LAB-101',
          approvedAt: '2026-09-01T10:00:00.000Z',
          analytes: [
            { testName: 'Glucose (Fasting)', value: '105', unit: 'mg/dL', referenceRange: '70 - 99 mg/dL', flag: 'high' },
            { testName: 'Serum Ferritin', value: '24', unit: 'ng/mL', referenceRange: '', flag: '' },
            { testName: 'Hemoglobin (Hb)', value: '11.2', unit: 'g/dL', referenceRange: '12.0 - 15.5 g/dL', flag: 'low' },
            { testName: 'HbA1c', value: '6.4', unit: '%', referenceRange: '4.0 - 5.6 %', flag: 'high' },
          ],
        };
      }
      if (docPath === 'lab_results/res_of_A_2') {
        return {
          resultId: 'res_of_A_2',
          linkedPatientUid: 'patient_A',
          labNameAr: 'مختبر بغداد المركزي',
          reportNumber: 'LAB-202',
          approvedAt: '2026-11-01T10:00:00.000Z',
          analytes: [
            { testName: 'Glucose (Fasting)', value: '6.2', unit: 'mmol/L', referenceRange: '3.9 - 5.5 mmol/L', flag: 'high' },
            { testName: 'Hemoglobin (Hb)', value: '12.4', unit: 'g/dL', referenceRange: '', flag: 'normal' },
          ],
        };
      }
      return null;
    },
    async listCollection(_token: string, collectionName: string) {
      if (collectionName === 'lab_results') {
        const d1 = await this.getDoc('', 'lab_results/res_of_A');
        const d2 = await this.getDoc('', 'lab_results/res_of_A_2');
        return [d1, d2].filter(Boolean) as Array<Record<string, unknown>>;
      }
      return [];
    },
  };

  const fakeAuth = {
    async verifyIdToken(token: string) {
      const found = mockTokens[token];
      if (!found) throw new Error('INVALID_TOKEN');
      return found;
    },
  };

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(
    '/api',
    createHaneenRouter({
      adminAuth: fakeAuth as never,
      getAdminDb: () => null,
      isFirestoreAdminReady: () => false,
      restDb: mockRestDb as never,
      store,
    }),
  );
  app.use(
    '/api',
    createAdminHaneenRouter({
      requireSuperAdmin: (req, res, next) => {
        if (req.headers.authorization === 'Bearer tok-admin') {
          next();
        } else {
          res.status(403).json({ error: 'FORBIDDEN' });
        }
      },
      store,
    }),
  );

  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    // Test A: Doctor and Lab blocked from Patient Haneen endpoint (403)
    const docResp = await fetch(`${base}/api/patient/haneen/bootstrap`, {
      headers: { Authorization: 'Bearer tok-doctor' },
    });
    assert.equal(docResp.status, 403, 'Doctor MUST receive 403 PATIENT_PORTAL_ONLY');

    const labResp = await fetch(`${base}/api/patient/haneen/bootstrap`, {
      headers: { Authorization: 'Bearer tok-lab' },
    });
    assert.equal(labResp.status, 403, 'Lab MUST receive 403 PATIENT_PORTAL_ONLY');

    // Test B: Patient A bootstrap creates conversation with consentGiven=false
    const bootA = await fetch(`${base}/api/patient/haneen/bootstrap`, {
      headers: { Authorization: 'Bearer tok-patient-a' },
    });
    assert.equal(bootA.status, 200);
    const bootAData = (await bootA.json()) as {
      activeConversationId: string;
      libraryStats?: { specialtiesCount: number; approvedTopicsCount: number; glossaryCount: number };
    };
    const convAId = bootAData.activeConversationId;
    assert.ok(convAId, 'Patient A should get a conversation ID');
    assert.ok((bootAData.libraryStats?.specialtiesCount || 0) >= 35, 'Bootstrap should expose full specialties count');
    assert.ok((bootAData.libraryStats?.approvedTopicsCount || 0) >= 15, 'Bootstrap should expose approved topics count');

    // Test C: Patient A tries attaching lab result WITHOUT consent -> MUST be 403 CONSENT_REQUIRED
    const noConsentResp = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'اشرحي لي النتيجة',
        attachedResultId: 'res_of_A',
      }),
    });
    assert.equal(noConsentResp.status, 403, 'Attaching lab result without consent must return 403');

    // Test D: Patient B attempts to read or chat in Patient A's conversation -> MUST be 403
    const crossRead = await fetch(`${base}/api/patient/haneen/bootstrap?conversationId=${convAId}`, {
      headers: { Authorization: 'Bearer tok-patient-b' },
    });
    assert.equal(crossRead.status, 403, 'Patient B reading Patient A conversation must return 403');

    const crossChat = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-b',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId: convAId, message: 'مرحبا' }),
    });
    assert.equal(crossChat.status, 403, 'Patient B posting to Patient A conversation must return 403');

    // Test E: Patient A grants consent and attaches her own lab result (missing range on Ferritin must NOT invent range)
    const consentResp = await fetch(`${base}/api/patient/haneen/conversations/${convAId}/consent`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ consentGiven: true, sharedResultIds: ['res_of_A'] }),
    });
    assert.equal(consentResp.status, 200);

    // Patient B tries granting consent on Patient B's conv with Patient A's lab result -> 403!
    const bootB = await fetch(`${base}/api/patient/haneen/bootstrap`, {
      headers: { Authorization: 'Bearer tok-patient-b' },
    });
    const bootBData = (await bootB.json()) as { activeConversationId: string };
    const crossResultConsent = await fetch(
      `${base}/api/patient/haneen/conversations/${bootBData.activeConversationId}/consent`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer tok-patient-b',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ consentGiven: true, sharedResultIds: ['res_of_A'] }),
      },
    );
    assert.equal(crossResultConsent.status, 403, 'Patient B cannot attach Patient A lab result');

    // Test F: Patient A sends consented lab result chat + emergency + dosage refusal
    const labChat = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'اشرحي لي قيم السكر والفيريتين',
        attachedResultId: 'res_of_A',
      }),
    });
    assert.equal(labChat.status, 200);
    const labChatData = (await labChat.json()) as { assistantMessage: { text: string; citations: unknown[] } };
    assert.ok(labChatData.assistantMessage.text.includes('70 - 99 mg/dL'), 'Should preserve printed reference range');
    assert.ok(labChatData.assistantMessage.text.includes('غير مذكور في التقرير'), 'Should not invent missing reference range');
    assert.ok(labChatData.assistantMessage.citations.length > 0, 'Should include internal citations');
    assert.ok(!labChatData.assistantMessage.text.includes('https://'), 'Normal reply text must NOT dump raw source URLs at bottom');

    const emergChat = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'عندي ألم شديد في الصدر وضيق تنفس مفاجئ',
      }),
    });
    assert.equal(emergChat.status, 200);
    const emergData = (await emergChat.json()) as { assistantMessage: { isEmergency?: boolean; text: string } };
    assert.equal(emergData.assistantMessage.isEmergency, true, 'Emergency flag must be true');
    assert.ok(emergData.assistantMessage.text.includes('طوارئ'), 'Must instruct immediate ER care');
    assert.ok(!emergData.assistantMessage.text.includes('https://'), 'Emergency reply text must stay concise without bottom URL dump');

    const refusalChat = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'كم جرعة الإنسولين اللي أزيدها اليوم؟',
      }),
    });
    assert.equal(refusalChat.status, 200);
    const refusalData = (await refusalChat.json()) as { assistantMessage: { isRefusal?: boolean; text: string } };
    assert.equal(refusalData.assistantMessage.isRefusal, true, 'Refusal flag must be true for insulin dosage question');
    assert.ok(!refusalData.assistantMessage.text.includes('https://'), 'Refusal text must not append URL footer');

    // Test F2: Instant warm greeting, thanks & curated topic fast-path
    assert.equal(detectGreetingOrThanks('السلام عليكم حنين'), 'greeting');
    assert.equal(detectGreetingOrThanks('شكراً جزيلاً حنين'), 'thanks');
    assert.equal(detectGreetingOrThanks('مرحبا حنين ما معنى HbA1c؟'), null, 'Greeting + medical question must NOT short-circuit as greeting');

    const instantHbA1c = buildInstantGentleTopicReply({
      text: 'ما هو فحص HbA1c وكيف يختلف عن السكر اللحظي؟',
      sources,
      dialectMode: 'iraqi_polite',
      hasAttachedContext: false,
    });
    assert.ok(instantHbA1c && instantHbA1c.citations.length > 0, 'HbA1c instant reply should include citations');

    const greetChat = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'السلام عليكم حنين',
      }),
    });
    assert.equal(greetChat.status, 200);
    const greetData = (await greetChat.json()) as {
      assistantMessage: { text: string; isFastReply?: boolean; isEmergency?: boolean; isRefusal?: boolean };
    };
    assert.equal(greetData.assistantMessage.isFastReply, true, 'Greeting should use fast-reply');
    assert.ok(!greetData.assistantMessage.isEmergency && !greetData.assistantMessage.isRefusal);
    assert.ok(greetData.assistantMessage.text.includes('أهلاً'), 'Greeting reply must be warm and polite');
    assert.ok(!greetData.assistantMessage.text.includes('GEMINI_API_KEY'), 'Must never expose GEMINI_API_KEY jargon');

    const topicChat = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'مرحبا حنين، ما معنى HbA1c؟',
      }),
    });
    assert.equal(topicChat.status, 200);
    const topicData = (await topicChat.json()) as {
      assistantMessage: { text: string; isFastReply?: boolean; citations: unknown[] };
    };
    assert.equal(topicData.assistantMessage.isFastReply, true, 'Common verified topic should use fast-reply');
    assert.ok(topicData.assistantMessage.citations.length > 0, 'Fast topic reply must include internal citations');
    assert.ok(topicData.assistantMessage.text.includes('HbA1c'));
    assert.ok(!topicData.assistantMessage.text.includes('GEMINI_API_KEY'), 'Must never expose GEMINI_API_KEY jargon');

    await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: convAId,
        message: 'بياناتي الخاصة 07709998887 ونتيجة مختبر النخبة الخاص',
      }),
    });

    // Test F3: Iraqi colloquial + typos + progressive detail levels + follow-up memory + SSE streaming
    console.log('5b) Testing Iraqi colloquial understanding, typos, detail levels & SSE stream...');
    assert.equal(detectGreetingOrThanks('هلاو حنينه شلونج'), 'greeting');
    assert.equal(detectGreetingOrThanks('مشكوره هواي يسلموو'), 'thanks');
    assert.equal(
      detectEmergencySymptoms('ما اكدر اتنفس وصدري يوجعني كلش').isEmergency,
      true,
      'Iraqi colloquial breathing + chest pain must trigger emergency gate',
    );
    assert.equal(
      detectMedicationDosageRequest('شكد اخذ حبايه من هذا العلاج؟'),
      true,
      'Iraqi colloquial dosage request must trigger refusal gate',
    );

    const iraqiBloodReply = buildInstantGentleTopicReply({
      text: 'دمي ناقص وعندي خمول، شنو يعني هموكلوبين؟',
      sources,
      dialectMode: 'iraqi_polite',
      hasAttachedContext: false,
      detailLevel: 'brief',
    });
    assert.ok(iraqiBloodReply && iraqiBloodReply.text.includes('الهيموغلوبين'), 'Should explain Hemoglobin simply for Iraqi colloquial phrase');
    assert.ok(iraqiBloodReply.text.includes('التوضيح البسيط'), 'Should include 4-part simple explanation');

    // Follow-up conversation memory test: ask about HbA1c briefly, then ask "اشرحيلي أكثر"
    const convMem = await fetch(`${base}/api/patient/haneen/conversations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'اختبار الذاكرة' }),
    });
    assert.equal(convMem.status, 201);
    const convMemData = (await convMem.json()) as { conversation: { conversationId: string } };
    const memConvId = convMemData.conversation.conversationId;

    const briefTurn = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: memConvId,
        message: 'شنو يعني التراكمي؟',
      }),
    });
    assert.equal(briefTurn.status, 200);
    const briefData = (await briefTurn.json()) as {
      assistantMessage: { text: string; detailLevel?: string; isFastReply?: boolean };
    };
    assert.equal(briefData.assistantMessage.detailLevel, 'brief');
    assert.ok(briefData.assistantMessage.text.includes('HbA1c'));

    const followUpTurn = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: memConvId,
        message: 'اشرحيلي أكثر',
      }),
    });
    assert.equal(followUpTurn.status, 200);
    const followUpData = (await followUpTurn.json()) as {
      assistantMessage: { text: string; detailLevel?: string };
    };
    assert.equal(followUpData.assistantMessage.detailLevel, 'standard');
    assert.ok(followUpData.assistantMessage.text.includes('HbA1c'), 'Follow-up should remember HbA1c topic');

    // SSE stream test
    const streamResp = await fetch(`${base}/api/patient/haneen/chat-stream`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: memConvId,
        message: 'تحليلي طالع عالي عن المعدل',
      }),
    });
    assert.equal(streamResp.status, 200);
    assert.ok((streamResp.headers.get('content-type') || '').includes('text/event-stream'));
    const streamBody = await streamResp.text();
    assert.ok(streamBody.includes('event: meta'), 'Stream should emit meta event');
    assert.ok(streamBody.includes('event: chunk'), 'Stream should emit chunk event');
    assert.ok(streamBody.includes('event: done'), 'Stream should emit done event');

    // Chunked retrieval compactness check
    assert.ok(cbcMatch.contextText.length <= 2500, `Brief knowledge context should be compact, got ${cbcMatch.contextText.length}`);

    // Test G: Super Admin overview returns aggregate telemetry & sources ONLY (zero patient chats/PII)
    const adminOverview = await fetch(`${base}/api/admin/haneen/overview`, {
      headers: { Authorization: 'Bearer tok-admin' },
    });
    assert.equal(adminOverview.status, 200);
    const adminText = await adminOverview.text();
    assert.ok(!adminText.includes('patient_A'), 'Admin overview must NEVER expose patient UIDs');
    assert.ok(!adminText.includes('07709998887'), 'Admin overview must NEVER expose patient chat messages');
    assert.ok(!adminText.includes('res_of_A'), 'Admin overview must NEVER expose patient lab result IDs');
    const adminJson = JSON.parse(adminText) as { telemetry: { emergencyRedirects: number; safetyRefusals: number } };
    assert.equal(adminJson.telemetry.emergencyRedirects, 1);
    assert.equal(adminJson.telemetry.safetyRefusals, 1);

    // =========================================================================
    // 6) Comprehensive Arabic Medical Library, QA Test Cases (File 11) & Safe Lab Comparison
    // =========================================================================
    console.log('6) Testing 11_QA_TEST_CASES, Radiology Guard, Topic Review Gate & Safe Lab Comparison...');

    // QA Case 1: Hemoglobin
    const qa1 = buildInstantGentleTopicReply({
      text: 'تحليلي يذكر الهيموغلوبين ناقص، شنو يعني هذا؟',
      sources,
      dialectMode: 'iraqi_polite',
      hasAttachedContext: false,
    });
    assert.ok(qa1 && qa1.text.includes('الأوكسجين') && qa1.text.includes('الحديد'), 'QA1: Plain Hb explanation');

    // QA Case 2: Ambiguous H / High clarification
    const qa2 = buildInstantGentleTopicReply({
      text: 'نتيجة التحليل طالعة H مرتفعة، شنو يعني؟',
      sources,
      dialectMode: 'iraqi_polite',
      hasAttachedContext: false,
    });
    assert.ok(qa2 && qa2.text.includes('H') && qa2.text.includes('اسم الفحص'), 'QA2: Clarify H without assuming cause');

    // QA Case 4: MRI disc bulge report wording
    const qa4 = buildInstantGentleTopicReply({
      text: 'تقرير الرنين كاتب انزلاق غضروفي خفيف، شنو يعني؟',
      sources,
      dialectMode: 'iraqi_polite',
      hasAttachedContext: false,
    });
    assert.ok(qa4 && qa4.text.includes('فقرات') && qa4.text.includes('ألم'), 'QA4: Plain MRI disc wording explanation');

    // QA Case 5: Radiology film diagnosis refusal via live chat endpoint
    const qa5Resp = await fetch(`${base}/api/patient/haneen/chat`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId: memConvId,
        message: 'شوفلي صورة الأشعة بيها ورم لو كسر لو جلطة؟',
      }),
    });
    assert.equal(qa5Resp.status, 200);
    const qa5Data = (await qa5Resp.json()) as { assistantMessage: { isRefusal?: boolean; text: string } };
    assert.equal(qa5Data.assistantMessage.isRefusal, true, 'QA5: Scan diagnosis request must be refused');
    assert.ok(qa5Data.assistantMessage.text.includes('طبيب الأشعة'), 'QA5: Direct to radiologist + treating doctor');

    // QA Case 7: Severe allergy & self-harm emergency triggers
    assert.equal(detectEmergencySymptoms('عندي تحسس شديد ولساني ورم').isEmergency, true, 'QA7: Severe allergy trigger');
    assert.equal(detectEmergencySymptoms('عندي أفكار إيذاء النفس').isEmergency, true, 'QA7: Self-harm trigger');

    // QA Case 8: Ambiguous "دمي ناقص؟" must clarify rather than diagnose anemia
    const qa8 = buildInstantGentleTopicReply({
      text: 'دمي ناقص؟',
      sources,
      dialectMode: 'iraqi_polite',
      hasAttachedContext: false,
    });
    assert.ok(qa8 && qa8.text.includes('الهيموغلوبين') && qa8.text.includes('أي تحليل'), 'QA8: Clarify ambiguous phrasing first');

    // Governance: Admin Library check + Wikipedia block + No auto-approve + Retrieval gating
    const libResp = await fetch(`${base}/api/admin/haneen/library`, {
      headers: { Authorization: 'Bearer tok-admin' },
    });
    assert.equal(libResp.status, 200);
    const libText = await libResp.text();
    assert.ok(!libText.includes('patient_A') && !libText.includes('07709998887'), 'Admin library must contain zero patient PII');
    const libJson = JSON.parse(libText) as {
      specialties: Array<{ completeness: string }>;
      topics: Array<{ topicId: string; status: string }>;
      registeredSources: Array<{ registryId: string; patientFacingAllowed: boolean }>;
    };
    assert.ok(libJson.specialties.length >= 35, 'Should have full taxonomy specialties');
    assert.ok(
      libJson.specialties.some((s) => s.completeness === 'missing') &&
        libJson.specialties.some((s) => s.completeness === 'intro_only'),
      'Roadmap must honestly flag missing and intro_only specialties',
    );
    const msfReg = libJson.registeredSources.find((r) => r.registryId === 'reg_msf');
    assert.equal(msfReg?.patientFacingAllowed, false, 'MSF source must stay internal-only');

    // Wikipedia URL blocked (400)
    const wikiReject = await fetch(`${base}/api/admin/haneen/topics`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        titleAr: 'اختبار ويكيبيديا',
        mainSpecialty: 'الباطنية',
        domain: 'clinical',
        simpleExplanation: 'شرح',
        whatItMeans: 'معنى',
        sourceName: 'Wikipedia',
        sourceUrl: 'https://ar.wikipedia.org/wiki/Health',
      }),
    });
    assert.equal(wikiReject.status, 400, 'Wikipedia URL MUST be blocked');

    // Create valid topic -> must NOT auto-approve even if initialStatus='approved' attempted
    const createdTopicResp = await fetch(`${base}/api/admin/haneen/topics`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        titleAr: 'مرض السلياك وحساسية القمح النادرة',
        mainSpecialty: 'الجهاز الهضمي والكبد',
        domain: 'clinical',
        simpleExplanation: 'حساسية مناعية ضد بروتين الغلوتين الموجود بالحنطة والشعير.',
        whatItMeans: 'أكل الغلوتين يهيج بطانة الأمعاء الدقيقة ويؤثر على الامتصاص.',
        sourceName: 'MSD Manual Consumer Arabic',
        sourceUrl: 'https://www.msdmanuals.com/ar/home',
        keywords: ['سلياك', 'celiac_unique_kw'],
        initialStatus: 'approved',
      }),
    });
    assert.equal(createdTopicResp.status, 201);
    const createdTopic = ((await createdTopicResp.json()) as { topic: { topicId: string; status: string } }).topic;
    assert.notEqual(createdTopic.status, 'approved', 'Newly created topic MUST NOT auto-approve');

    // Verify draft topic is NOT retrieved for patient
    const draftRetr = retrieveRelevantKnowledge(
      sources,
      'celiac_unique_kw',
      3,
      'brief',
      store.getApprovedTopics(),
      store.getGlossaryEntries(),
    );
    assert.ok(
      !draftRetr.matchedTopics.some((t) => t.topicId === createdTopic.topicId),
      'Unapproved draft topic MUST NOT appear in patient retrieval',
    );

    // Approve without reviewerName -> 400
    const noReviewerApprove = await fetch(
      `${base}/api/admin/haneen/topics/${createdTopic.topicId}/review`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'approved', reviewerName: '' }),
      },
    );
    assert.equal(noReviewerApprove.status, 400, 'Approval without specialist reviewerName MUST return 400');

    // Approve WITH reviewerName -> 200 and now retrieved!
    const validApprove = await fetch(
      `${base}/api/admin/haneen/topics/${createdTopic.topicId}/review`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'approved',
          reviewerName: 'د. حيدر الموسوي — استشاري باطنية',
        }),
      },
    );
    assert.equal(validApprove.status, 200);
    const approvedRetr = retrieveRelevantKnowledge(
      sources,
      'celiac_unique_kw',
      3,
      'brief',
      store.getApprovedTopics(),
      store.getGlossaryEntries(),
    );
    assert.ok(
      approvedRetr.matchedTopics.some((t) => t.topicId === createdTopic.topicId),
      'Approved topic MUST appear in patient retrieval',
    );

    // Retire topic -> no longer retrieved!
    const retireResp = await fetch(
      `${base}/api/admin/haneen/topics/${createdTopic.topicId}/review`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer tok-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'retired', changeNote: 'مؤرشف' }),
      },
    );
    assert.equal(retireResp.status, 200);
    const retiredRetr = retrieveRelevantKnowledge(
      sources,
      'celiac_unique_kw',
      3,
      'brief',
      store.getApprovedTopics(),
      store.getGlossaryEntries(),
    );
    assert.ok(
      !retiredRetr.matchedTopics.some((t) => t.topicId === createdTopic.topicId),
      'Retired topic MUST NOT appear in patient retrieval',
    );

    // Longitudinal Lab Comparison Tests (consent, cross-patient guard, unit safety, missing range)
    const cmpNoConsent = await fetch(`${base}/api/patient/haneen/compare-results`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ consentGiven: false }),
    });
    assert.equal(cmpNoConsent.status, 403, 'Lab comparison without consent must return 403');

    const cmpCrossPatient = await fetch(`${base}/api/patient/haneen/compare-results`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-b',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ consentGiven: true, resultIds: ['res_of_A'] }),
    });
    assert.equal(cmpCrossPatient.status, 403, 'Patient B comparing Patient A lab result must return 403');

    const cmpValid = await fetch(`${base}/api/patient/haneen/compare-results`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-patient-a',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ consentGiven: true }),
    });
    assert.equal(cmpValid.status, 200);
    const cmpJson = (await cmpValid.json()) as {
      reportsScanned: number;
      series: Array<{
        seriesKey: string;
        comparable: boolean;
        trendDirection: string;
        deltaValue: number | null;
        latestPrintedReferenceRange: string;
      }>;
    };
    assert.equal(cmpJson.reportsScanned, 2, 'Should read both patientUid and linkedPatientUid patient reports');
    const hbSeries = cmpJson.series.find((s) => s.seriesKey === 'test_hemoglobin');
    assert.ok(hbSeries && hbSeries.comparable === true, 'Same test + identical g/dL unit should be comparable');
    assert.equal(hbSeries.deltaValue, 1.2, 'Hemoglobin improved from 11.2 to 12.4 (+1.2)');
    assert.equal(hbSeries.latestPrintedReferenceRange, 'غير مذكور في التقرير', 'Missing ref range must never be invented');

    const glucSeries = cmpJson.series.find((s) => s.seriesKey === 'test_glucose_fasting');
    assert.ok(
      glucSeries && glucSeries.comparable === false && glucSeries.trendDirection === 'unit_mismatch',
      'Mismatched units (mg/dL vs mmol/L) must NEVER be silently converted',
    );
    const a1cSeries = cmpJson.series.find((s) => s.seriesKey === 'test_hba1c');
    assert.ok(a1cSeries && a1cSeries.seriesKey !== glucSeries.seriesKey, 'HbA1c and Fasting Glucose must stay separate');

    console.log('ALL HANEEN AI SAFETY, LIBRARY GOVERNANCE, COMPARISON, ISOLATION & QA TESTS PASSED!');
  } finally {
    store.dispose();
    server.close();
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
