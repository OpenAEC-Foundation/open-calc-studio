import type { StateCreator } from 'zustand';
import type { CompanyInfo } from '@/types/costModel';

export const defaultCompanyInfo: CompanyInfo = {
  name: '',
  postalAddress: '',
  postalCity: '',
  visitAddress: '',
  visitCity: '',
  phone: '',
  fax: '',
  email: '',
  logoLeft: '',
  logoRight: '',
};

export interface CompanySlice {
  companyInfo: CompanyInfo;
  setCompanyInfo: (info: CompanyInfo) => void;
}

export const createCompanySlice: StateCreator<CompanySlice> = (set) => ({
  companyInfo: { ...defaultCompanyInfo },
  setCompanyInfo: (companyInfo) => set({ companyInfo }),
});
