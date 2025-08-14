import { NavigateFunction } from 'react-router-dom';

export const createNavigationHelper = (navigate: NavigateFunction) => {
  return {
    openSessionDetails: (sessionId: string) => {
      navigate(`/session/${sessionId}`);
    }
  };
};