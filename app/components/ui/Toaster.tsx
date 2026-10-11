import { cssTransition, ToastContainer } from 'react-toastify';
import { Icon } from './icons';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

// One container for the whole app (root.tsx): the dark Paper toast, bottom-right, 4s
export function Toaster() {
  return (
    <ToastContainer
      position="bottom-right"
      autoClose={4000}
      hideProgressBar
      pauseOnFocusLoss
      transition={toastAnimation}
      closeButton={({ closeToast }) => (
        <button className="Toastify__close-button" aria-label="Dismiss" onClick={closeToast}>
          <Icon.Close size={14} />
        </button>
      )}
      icon={({ type }) => {
        switch (type) {
          case 'success':
            return <Icon.Check size={16} />;
          case 'error':
            return <Icon.Alert size={16} strokeWidth={1.75} />;
          default:
            return <Icon.Info size={16} />;
        }
      }}
    />
  );
}
