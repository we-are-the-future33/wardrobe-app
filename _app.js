import '../styles/globals.css';
import dynamic from 'next/dynamic';

// SSR 완전 비활성화 - hydration 에러 방지
const App = dynamic(() => Promise.resolve(({ Component, pageProps }) => <Component {...pageProps} />), { ssr: false });

export default function MyApp(props) {
  return <App {...props} />;
}
