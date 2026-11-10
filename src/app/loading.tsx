import BrandLoader from './components/BrandLoader';

export default function Loading() {
  return (
    <div className="grid min-h-[60dvh] flex-1 place-items-center">
      <div className="loader-enter">
        <BrandLoader label="Loading" />
      </div>
    </div>
  );
}
