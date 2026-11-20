import { useState } from 'react';
import hartLogo from '../assets/hartLogo.png';

// Bundle the official logo; deployments can optionally override its location.
export default function CompanyBrand() {
  const logoUrl = import.meta.env.VITE_HART_LOGO_URL || hartLogo;
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="company-brand" aria-label="Engineered by HART">
      {logoUrl && !imageFailed ? (
        <img
          src={logoUrl}
          alt="HART — Hamilton Research"
          className="company-logo"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="company-wordmark">
          HART<span className="brand-accent">.</span>
        </span>
      )}
    </div>
  );
}
