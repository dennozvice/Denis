/*
 * Eseguibile nativo di Eve.app: carica Python al proprio interno ed esegue `eve run --window`.
 *
 * Serve perché macOS concede il microfono (e lo elenca in Privacy e sicurezza) solo a
 * un'applicazione vera: con uno script di shell che lancia Python la richiesta viene
 * attribuita a Python e negata in silenzio. Viene compilato da `eve app` con clang e
 * i valori qui sotto arrivano come -D dalla riga di comando:
 *   EVE_PYTHON   percorso del python dell'ambiente .venv
 *   EVE_SITE     cartella site-packages dell'ambiente .venv (i pacchetti installati)
 *   EVE_VENV     cartella dell'ambiente .venv
 *   EVE_PROJECT  cartella del progetto (directory di lavoro)
 *   EVE_CONFIG   percorso del config.toml, oppure "" per quello predefinito
 *   EVE_LOG      file di registro
 *   EVE_NAME     nome dell'app, per la finestra di errore
 */
#include <Python.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <libgen.h>

#ifndef EVE_PYTHON
#error "EVE_PYTHON non definito"
#endif

/* mkdir -p */
static void make_dirs(const char *path) {
    char buffer[4096];
    strncpy(buffer, path, sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';
    for (char *p = buffer + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            mkdir(buffer, 0755);
            *p = '/';
        }
    }
    mkdir(buffer, 0755);
}

static void show_error(const char *message) {
    char command[4096];
    snprintf(command, sizeof(command),
             "/usr/bin/osascript -e 'on run argv' -e 'display alert (item 1 of argv) message (item 2 of argv) as critical' -e 'end run' "
             "\"%s non è riuscita ad avviarsi\" \"%s\" >/dev/null 2>&1",
             EVE_NAME, message);
    system(command);
}

int main(int argc, char **argv) {
    (void)argc;
    (void)argv;
    chdir(EVE_PROJECT);
    {
        char log_copy[4096];
        strncpy(log_copy, EVE_LOG, sizeof(log_copy) - 1);
        log_copy[sizeof(log_copy) - 1] = '\0';
        make_dirs(dirname(log_copy));
    }
    if (freopen(EVE_LOG, "a", stdout) == NULL || freopen(EVE_LOG, "a", stderr) == NULL) {
        show_error("Impossibile scrivere il file di registro");
        return 1;
    }
    setvbuf(stdout, NULL, _IOLBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    fprintf(stdout, "=== avvio dell'app ===\n");

    PyStatus status;
    PyConfig config;
    PyConfig_InitPythonConfig(&config);
    config.parse_argv = 0;      /* gli argomenti sono già quelli del programma, non dell'interprete */
    config.isolated = 0;
    config.use_environment = 1;
    config.buffered_stdio = 0;

    /* Facendosi passare per il python dell'ambiente virtuale, Python trova pyvenv.cfg
       e quindi i pacchetti installati in .venv (sounddevice, anthropic, pywebview...). */
    status = PyConfig_SetBytesString(&config, &config.program_name, EVE_PYTHON);
    if (PyStatus_Exception(status)) goto failed;
    status = PyConfig_SetBytesString(&config, &config.executable, EVE_PYTHON);
    if (PyStatus_Exception(status)) goto failed;

    {
        char *args_with_config[] = {"eve", "--config", EVE_CONFIG, "run", "--window"};
        char *args_default[] = {"eve", "run", "--window"};
        if (strlen(EVE_CONFIG) > 0)
            status = PyConfig_SetBytesArgv(&config, 5, args_with_config);
        else
            status = PyConfig_SetBytesArgv(&config, 3, args_default);
        if (PyStatus_Exception(status)) goto failed;
    }
    status = PyConfig_SetBytesString(&config, &config.run_module, "eve");
    if (PyStatus_Exception(status)) goto failed;

    status = Py_InitializeFromConfig(&config);
    if (PyStatus_Exception(status)) goto failed;
    PyConfig_Clear(&config);

    /* I pacchetti dell'ambiente virtuale: aggiunti esplicitamente, senza affidarsi
       al riconoscimento automatico di pyvenv.cfg. */
    {
        char code_buffer[8192];
        snprintf(code_buffer, sizeof(code_buffer),
                 "import site, sys\n"
                 "_before = list(sys.path)\n"
                 "site.addsitedir(\"%s\")\n"
                 "sys.path = [p for p in sys.path if p not in _before] + _before\n"
                 "sys.prefix = sys.exec_prefix = \"%s\"\n",
                 EVE_SITE, EVE_VENV);
        if (PyRun_SimpleString(code_buffer) != 0) {
            fprintf(stderr, "impossibile aggiungere i pacchetti dell'ambiente\n");
            show_error("Ambiente Python non trovato: rilancia `eve app`");
            return 1;
        }
    }

    {
        int code = Py_RunMain();
        if (code != 0) {
            fprintf(stderr, "eve è terminata con codice %d\n", code);
            char message[512];
            snprintf(message, sizeof(message), "Codice %d. Dettagli nel file %s", code, EVE_LOG);
            show_error(message);
        }
        return code;
    }

failed:
    PyConfig_Clear(&config);
    if (PyStatus_IsExit(status)) return status.exitcode;
    fprintf(stderr, "avvio di Python fallito: %s\n", status.err_msg ? status.err_msg : "?");
    show_error(status.err_msg ? status.err_msg : "avvio di Python fallito");
    return 1;
}
