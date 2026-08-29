import { McpTestClient } from '../client.js';

/**
 * Agent workflow: Form
 *
 * Snapshot → find fields → fill/select/check using refs → submit → verify.
 * Zero CSS selectors used.
 */
describe('Agent Workflow: Form', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    await mcp.startBrowser(true);
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('fills and submits a form using only refs', async () => {
    const page = `data:text/html,<html><body>
      <h1>Contact Form</h1>
      <form id="contact">
        <label>Name <input type="text" name="name" /></label>
        <label>Email <input type="email" name="email" /></label>
        <label>Country
          <select name="country">
            <option value="">Choose...</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="ca">Canada</option>
          </select>
        </label>
        <label><input type="checkbox" name="agree" /> I agree</label>
        <button type="submit">Submit</button>
      </form>
      <div id="result"></div>
      <script>
        document.getElementById('contact').addEventListener('submit', function(e) {
          e.preventDefault();
          var fd = new FormData(this);
          var obj = {};
          fd.forEach(function(v, k) { obj[k] = v; });
          document.getElementById('result').textContent = JSON.stringify(obj);
        });
      </script>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });

    // Take a snapshot
    const snapResult = await mcp.callTool('browser_snapshot');
    const snapText = mcp.getText(snapResult);
    expect(snapText).toContain('textbox');
    expect(snapText).toContain('button');

    // Find the name field
    const nameResult = await mcp.callTool('browser_find', {
      role: 'textbox',
      name: 'Name'
    });
    const nameText = mcp.getText(nameResult);
    const nameRef = nameText.match(/\[(e\d+)\]/)?.[1];
    expect(nameRef).toBeDefined();

    // Find the email field
    const emailResult = await mcp.callTool('browser_find', {
      role: 'textbox',
      name: 'Email'
    });
    const emailText = mcp.getText(emailResult);
    const emailRef = emailText.match(/\[(e\d+)\]/)?.[1];
    expect(emailRef).toBeDefined();

    // Fill fields using refs
    await mcp.callTool('browser_fill', {
      ref: nameRef!,
      value: 'Jane Doe'
    });
    await mcp.callTool('browser_fill', {
      ref: emailRef!,
      value: 'jane@example.com'
    });

    // Find and select country
    const countryResult = await mcp.callTool('browser_find', {
      role: 'combobox',
      name: 'Country'
    });
    const countryText = mcp.getText(countryResult);
    const countryRef = countryText.match(/\[(e\d+)\]/)?.[1];
    expect(countryRef).toBeDefined();

    await mcp.callTool('browser_select', {
      ref: countryRef!,
      value: 'ca'
    });

    // Find and check the agree checkbox
    const checkResult = await mcp.callTool('browser_find', {
      role: 'checkbox'
    });
    const checkText = mcp.getText(checkResult);
    const checkRef = checkText.match(/\[(e\d+)\]/)?.[1];
    expect(checkRef).toBeDefined();

    await mcp.callTool('browser_check', {
      ref: checkRef!,
      checked: true
    });

    // Find and click the submit button
    const btnResult = await mcp.callTool('browser_find', {
      role: 'button',
      name: 'Submit'
    });
    const btnText = mcp.getText(btnResult);
    const btnRef = btnText.match(/\[(e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();

    await mcp.callTool('browser_click', { ref: btnRef! });

    // Verify the form result
    await new Promise((r) => setTimeout(r, 500));
    const evalResult = await mcp.callTool('browser_evaluate', {
      expression: 'document.getElementById("result").textContent'
    });
    const evalText = mcp.getText(evalResult);
    expect(evalText).toContain('Jane Doe');
    expect(evalText).toContain('jane@example.com');
    expect(evalText).toContain('ca');
  });
});
