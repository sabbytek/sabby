/**
 * SMS provider interface — swap Termii/VTPASS/AWS SNS without touching callers.
 */

export interface SmsProvider {
  readonly name: string;
  send(to: string, message: string): Promise<void>;
}
