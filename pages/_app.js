import '../styles/globals.css';
import dynamic from 'next/dynamic';

const App = dynamic(() => Promise.resolve(({ Component, pageProps }) => <Component {...pageProps} />), { ssr: false });

export default function MyApp(props) {
  return <App {...props} />;
}
