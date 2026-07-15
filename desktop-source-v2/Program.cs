using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace RasputimDesktop
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            bool primeiraInstancia;
            using (var mutex = new Mutex(true, @"Local\RasputimDesktop540", out primeiraInstancia))
            {
                if (!primeiraInstancia)
                {
                    MessageBox.Show("O Rasputim já está aberto.", "Rasputim", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                try
                {
                    var raiz = AppDomain.CurrentDomain.BaseDirectory;
                    Configuracao.Garantir(raiz);
                    if (!Configuracao.TemChaveIa(raiz))
                    {
                        using (var tela = new TelaConfiguracao(raiz))
                        {
                            if (tela.ShowDialog() != DialogResult.OK) return;
                        }
                    }

                    var servidor = new ServidorLocal(raiz);
                    servidor.Iniciar();
                    Application.Run(new JanelaPrincipal(raiz, servidor));
                }
                catch (Exception erro)
                {
                    MessageBox.Show(
                        erro.Message,
                        "Rasputim — erro ao iniciar",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
            }
        }
    }

    internal sealed class ServidorLocal : IDisposable
    {
        private readonly string raiz;
        private Process processo;
        private bool iniciouProcesso;
        public int Porta { get; private set; }
        public string Endereco { get { return "http://127.0.0.1:" + Porta; } }

        public ServidorLocal(string raizAplicativo)
        {
            raiz = raizAplicativo;
            Porta = Configuracao.LerPorta(raiz);
        }

        public void Iniciar()
        {
            if (ServidorResponde().GetAwaiter().GetResult()) return;

            string node = Path.Combine(raiz, "node.exe");
            string servidor = Path.Combine(raiz, "server.js");
            if (!File.Exists(node)) throw new FileNotFoundException("node.exe não foi encontrado no pacote do aplicativo.");
            if (!File.Exists(servidor)) throw new FileNotFoundException("server.js não foi encontrado no pacote do aplicativo.");

            var inicio = new ProcessStartInfo
            {
                FileName = node,
                Arguments = "--max-old-space-size=640 \"" + servidor + "\"",
                WorkingDirectory = raiz,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            inicio.EnvironmentVariables["RASPUTIM_DESKTOP"] = "1";
            processo = Process.Start(inicio);
            if (processo == null) throw new InvalidOperationException("Não foi possível iniciar o servidor interno.");
            iniciouProcesso = true;

            string log = Path.Combine(raiz, "rasputim-desktop.log");
            processo.OutputDataReceived += (s, e) => GravarLog(log, e.Data);
            processo.ErrorDataReceived += (s, e) => GravarLog(log, e.Data);
            processo.BeginOutputReadLine();
            processo.BeginErrorReadLine();

            for (int tentativa = 0; tentativa < 50; tentativa++)
            {
                if (processo.HasExited) throw new InvalidOperationException("O servidor interno encerrou durante a inicialização. Consulte rasputim-desktop.log.");
                if (ServidorResponde().GetAwaiter().GetResult()) return;
                Thread.Sleep(400);
            }
            throw new TimeoutException("O servidor do Rasputim não respondeu na porta " + Porta + ". Consulte rasputim-desktop.log.");
        }

        private static readonly object TravaLog = new object();
        private static void GravarLog(string arquivo, string linha)
        {
            if (String.IsNullOrEmpty(linha)) return;
            lock (TravaLog)
            {
                File.AppendAllText(arquivo, "[" + DateTime.Now.ToString("s") + "] " + linha + Environment.NewLine);
            }
        }

        private async Task<bool> ServidorResponde()
        {
            try
            {
                using (var cliente = new HttpClient { Timeout = TimeSpan.FromSeconds(1.5) })
                {
                    var resposta = await cliente.GetAsync(Endereco + "/status");
                    return resposta.IsSuccessStatusCode;
                }
            }
            catch { return false; }
        }

        public void Dispose()
        {
            if (!iniciouProcesso || processo == null) return;
            try
            {
                if (!processo.HasExited)
                {
                    processo.Kill();
                    processo.WaitForExit(3000);
                }
            }
            catch { }
            processo.Dispose();
        }
    }

    internal sealed class JanelaPrincipal : Form
    {
        private readonly string raiz;
        private readonly ServidorLocal servidor;
        private readonly WebView2 navegador;

        public JanelaPrincipal(string raizAplicativo, ServidorLocal servidorLocal)
        {
            raiz = raizAplicativo;
            servidor = servidorLocal;
            Text = "Rasputim — Mercado, Materiais e Produção";
            WindowState = FormWindowState.Maximized;
            MinimumSize = new Size(960, 640);
            StartPosition = FormStartPosition.CenterScreen;
            try { Icon = new Icon(Path.Combine(raiz, "Rasputim.ico")); } catch { }

            navegador = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(navegador);
            Load += Carregar;
            FormClosed += Encerrar;
        }

        private async void Carregar(object sender, EventArgs e)
        {
            try
            {
                string dados = Path.Combine(raiz, "dados", "desktop-webview");
                Directory.CreateDirectory(dados);
                var ambiente = await CoreWebView2Environment.CreateAsync(null, dados);
                await navegador.EnsureCoreWebView2Async(ambiente);
                navegador.CoreWebView2.Settings.AreDevToolsEnabled = false;
                navegador.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = true;
                navegador.CoreWebView2.Settings.IsStatusBarEnabled = false;
                navegador.CoreWebView2.NavigationStarting += ValidarNavegacao;
                navegador.Source = new Uri(servidor.Endereco);
            }
            catch (Exception erro)
            {
                MessageBox.Show(
                    "A janela WebView2 não pôde ser aberta. Atualize o Microsoft Edge WebView2 Runtime pelo site oficial da Microsoft.\n\nDetalhe: " + erro.Message,
                    "Rasputim",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Close();
            }
        }

        private void ValidarNavegacao(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            Uri destino;
            if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out destino)) { e.Cancel = true; return; }
            bool permitido = destino.Host == "127.0.0.1" && destino.Port == servidor.Porta;
            if (!permitido && destino.Scheme != "about" && destino.Scheme != "blob" && destino.Scheme != "data") e.Cancel = true;
        }

        private void Encerrar(object sender, FormClosedEventArgs e)
        {
            navegador.Dispose();
            servidor.Dispose();
        }
    }

    internal sealed class TelaConfiguracao : Form
    {
        private readonly string raiz;
        private readonly TextBox chaveIa = new TextBox();
        private readonly ComboBox pesquisa = new ComboBox();
        private readonly TextBox chavePesquisa = new TextBox();

        public TelaConfiguracao(string raizAplicativo)
        {
            raiz = raizAplicativo;
            Text = "Configurar Rasputim";
            Width = 620;
            Height = 370;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;

            var painel = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 9 };
            painel.RowStyles.Clear();
            Controls.Add(painel);

            painel.Controls.Add(new Label { Text = "Configuração inicial", Font = new Font(Font.FontFamily, 15, FontStyle.Bold), AutoSize = true });
            painel.Controls.Add(new Label { Text = "As chaves ficam somente no arquivo .env deste computador.", AutoSize = true });
            painel.Controls.Add(new Label { Text = "Chave do OpenRouter (obrigatória):", AutoSize = true, Margin = new Padding(0, 18, 0, 4) });
            chaveIa.Dock = DockStyle.Top;
            chaveIa.UseSystemPasswordChar = true;
            painel.Controls.Add(chaveIa);
            painel.Controls.Add(new Label { Text = "Pesquisa de mercado (opcional):", AutoSize = true, Margin = new Padding(0, 14, 0, 4) });
            pesquisa.Items.AddRange(new object[] { "Nenhuma", "Serper", "Brave" });
            pesquisa.SelectedIndex = 0;
            pesquisa.DropDownStyle = ComboBoxStyle.DropDownList;
            pesquisa.Dock = DockStyle.Top;
            painel.Controls.Add(pesquisa);
            painel.Controls.Add(new Label { Text = "Chave da pesquisa:", AutoSize = true, Margin = new Padding(0, 10, 0, 4) });
            chavePesquisa.Dock = DockStyle.Top;
            chavePesquisa.UseSystemPasswordChar = true;
            painel.Controls.Add(chavePesquisa);

            var botoes = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Margin = new Padding(0, 18, 0, 0) };
            var salvar = new Button { Text = "Salvar e abrir", Width = 130, Height = 34 };
            var cancelar = new Button { Text = "Cancelar", Width = 100, Height = 34 };
            salvar.Click += Salvar;
            cancelar.Click += (s, e) => { DialogResult = DialogResult.Cancel; Close(); };
            botoes.Controls.Add(salvar);
            botoes.Controls.Add(cancelar);
            painel.Controls.Add(botoes);
            AcceptButton = salvar;
            CancelButton = cancelar;
        }

        private void Salvar(object sender, EventArgs e)
        {
            string ia = chaveIa.Text.Trim();
            if (ia.Length < 10)
            {
                MessageBox.Show("Informe uma chave válida do OpenRouter.", "Rasputim", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            string provedor = pesquisa.SelectedItem.ToString();
            string chaveBusca = chavePesquisa.Text.Trim();
            Configuracao.Salvar(raiz, ia, provedor, chaveBusca);
            DialogResult = DialogResult.OK;
            Close();
        }
    }

    internal static class Configuracao
    {
        public static void Garantir(string raiz)
        {
            string destino = Path.Combine(raiz, ".env");
            string exemplo = Path.Combine(raiz, ".env.example");
            if (!File.Exists(destino) && File.Exists(exemplo)) File.Copy(exemplo, destino);
        }

        public static bool TemChaveIa(string raiz)
        {
            string valor;
            return Ler(raiz).TryGetValue("AI_API_KEY", out valor) && !String.IsNullOrWhiteSpace(valor);
        }

        public static int LerPorta(string raiz)
        {
            string valor;
            int porta;
            if (Ler(raiz).TryGetValue("PORT", out valor) && Int32.TryParse(valor, out porta) && porta > 0 && porta <= 65535) return porta;
            return 3333;
        }

        public static void Salvar(string raiz, string ia, string provedor, string chavePesquisa)
        {
            var dados = Ler(raiz);
            dados["AI_MODE"] = "cloud";
            dados["AI_PROVIDER"] = "openrouter";
            dados["AI_BASE_URL"] = "https://openrouter.ai/api/v1";
            dados["AI_MODEL"] = "qwen/qwen3-14b";
            dados["AI_API_KEY"] = ia;
            if (provedor == "Serper" && !String.IsNullOrWhiteSpace(chavePesquisa)) dados["SERPER_API_KEY"] = chavePesquisa;
            if (provedor == "Brave" && !String.IsNullOrWhiteSpace(chavePesquisa)) dados["BRAVE_API_KEY"] = chavePesquisa;

            var linhas = new List<string>();
            foreach (var item in dados) linhas.Add(item.Key + "=" + item.Value);
            File.WriteAllLines(Path.Combine(raiz, ".env"), linhas.ToArray(), new UTF8Encoding(false));
        }

        private static Dictionary<string, string> Ler(string raiz)
        {
            var dados = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            string arquivo = Path.Combine(raiz, ".env");
            if (!File.Exists(arquivo)) return dados;
            foreach (string bruta in File.ReadAllLines(arquivo))
            {
                string linha = bruta.Trim();
                if (linha.Length == 0 || linha.StartsWith("#")) continue;
                int igual = linha.IndexOf('=');
                if (igual <= 0) continue;
                dados[linha.Substring(0, igual).Trim()] = linha.Substring(igual + 1).Trim();
            }
            return dados;
        }
    }
}
