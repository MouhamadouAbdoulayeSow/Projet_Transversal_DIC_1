// Utilitaire pour gérer la navigation depuis les intercepteurs axios
let navigateFunction: ((path: string) => void) | null = null;

export const setNavigate = (navigate: (path: string) => void) => {
  navigateFunction = navigate;
};

export const navigateTo = (path: string) => {
  if (navigateFunction) {
    navigateFunction(path);
  } else {
    // Fallback si navigate n'est pas encore défini
    window.location.href = path;
  }
};

