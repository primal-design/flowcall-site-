import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import twilio from "twilio";

dotenv.config();

const app = express();
const VoiceResponse = twilio.twiml.VoiceResponse;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const port = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessions = new Map();

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, []);
  }
  return sessions.get(callSid);
}

function clearSession(callSid) {
  sessions.delete(callSid);
}

function buildSystemPrompt() {
  const businessName = process.env.BUSINESS_NAME || "the business";
  const description = process.env.BUSINESS_DESCRIPTION || "A local business.";
  const phone = process.env.BUSINESS_PHONE || "N/A";

  return [
    `You are a professional AI receptionist for ${businessName}.`,
    `Business details: ${description}`,
    `Business phone: ${phone}`,
    "Goals:",
    "1) Greet callers warmly.",
    "2) Answer common questions clearly.",
    "3) Collect caller name, reason for calling, and a callback number if needed.",
    "4) Keep responses concise and phone-friendly.",
    "5) If you do not know an answer, say you will pass the message to staff.",
    "Never claim actions outside this call unless explicitly asked.",
    "Avoid markdown or bullet points. Plain spoken sentences only."
  ].join("\n");
}

async function generateReceptionistReply(history, callerMessage) {
  const systemPrompt = buildSystemPrompt();
  const recent = history.slice(-10);

  const messages = [
    { role: "system", content: systemPrompt },
    ...recent,
    { role: "user", content: callerMessage }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 160,
    messages
  });

  return response.choices?.[0]?.message?.content?.trim() ||
    "Thanks for calling. Could you repeat that, please?";
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/voice", (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid || "unknown";

  getSession(callSid);

  twiml.say(
    { voice: "alice" },
    "Hello, thanks for calling. I am the AI receptionist. How can I help you today?"
  );

  const gather = twiml.gather({
    input: "speech",
    action: "/process-speech",
    method: "POST",
    speechTimeout: "auto"
  });

  gather.say({ voice: "alice" }, "Please tell me what you need.");
  twiml.redirect({ method: "POST" }, "/voice");

  res.type("text/xml").send(twiml.toString());
});

app.post("/process-speech", async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid || "unknown";
  const speechResult = (req.body.SpeechResult || "").trim();

  if (!speechResult) {
    twiml.say({ voice: "alice" }, "Sorry, I did not catch that.");
    const gather = twiml.gather({
      input: "speech",
      action: "/process-speech",
      method: "POST",
      speechTimeout: "auto"
    });
    gather.say({ voice: "alice" }, "Could you say that again?");
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const session = getSession(callSid);
    const aiReply = await generateReceptionistReply(session, speechResult);

    session.push({ role: "user", content: speechResult });
    session.push({ role: "assistant", content: aiReply });

    twiml.say({ voice: "alice" }, aiReply);

    const gather = twiml.gather({
      input: "speech",
      action: "/process-speech",
      method: "POST",
      speechTimeout: "auto"
    });
    gather.say({ voice: "alice" }, "Anything else I can help with?");

    return res.type("text/xml").send(twiml.toString());
  } catch (error) {
    console.error("AI processing error:", error);
    twiml.say(
      { voice: "alice" },
      "I am having trouble right now. I will share your message with our team."
    );
    twiml.say({ voice: "alice" }, "Please leave your name and callback number after the tone.");
    twiml.record({ maxLength: 60, playBeep: true });
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }
});

app.post("/voice-status", (req, res) => {
  const callSid = req.body.CallSid;
  const status = req.body.CallStatus;

  if (callSid && ["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
    clearSession(callSid);
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`AI receptionist server listening on port ${port}`);
});
