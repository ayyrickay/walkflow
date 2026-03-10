export type TwilioVoicePayload = {
  CallSid?: string;
  From?: string;
};

export type TwilioEventPayload = {
  callSid?: string;
  eventType?: string;
  transcript?: string;
};
