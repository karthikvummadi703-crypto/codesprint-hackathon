export interface FormState {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}
