import '../scss/Footer.scss'

const Footer = () => {
    const handleRepoClick = async () => {
        const repoUrl = 'https://github.com/f4iny/ClipBoardPro';
        try {
            if (typeof window !== 'undefined' && window.electronAPI) {
                await window.electronAPI.openExternal(repoUrl);
            } else {
                window.open(repoUrl, '_blank', 'noopener,noreferrer');
            }
        } catch {
            window.open(repoUrl, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <footer className="footer">
            <div className="container">
                <div className="footer-content">
                    <div className="footer-left">
                        <div className="copyright">
                            <span>Made with </span>
                            <span className="heart">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                            </span>
                            <span> by </span>
                            <span 
                                className="wenz-link" 
                                onClick={handleRepoClick}
                                title="Visit GitHub repository"
                                style={{ cursor: 'pointer' }}
                            >
                                f4iny
                            </span>
                        </div>
                    </div>

                    <div className="footer-right">
                        <button
                            className="donate-btn"
                            onClick={handleRepoClick}
                            title="Visit repository on GitHub"
                        >
                            <span className="donate-text">GitHub</span>
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default Footer