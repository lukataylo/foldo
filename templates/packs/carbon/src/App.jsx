import { Button, Content, Header, HeaderName, Theme, Tile } from '@carbon/react';

// Blank IBM Carbon starter: components from '@carbon/react', icons from '@carbon/icons-react' (also installed).
export default function App() {
  return (
    <Theme theme="g100">
      <Header aria-label="App">
        <HeaderName href="#" prefix="Foldo">Carbon app</HeaderName>
      </Header>
      <Content style={{ minHeight: '100vh', paddingTop: '4rem' }}>
        <Tile>
          <h2>Your IBM Carbon app starts here</h2>
          <Button style={{ marginTop: '1rem' }}>Get started</Button>
        </Tile>
      </Content>
    </Theme>
  );
}
