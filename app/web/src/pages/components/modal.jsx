import { useEffect, useState, useCallback } from "react";

const ANIM_MS = 200;

export default function Modal({ title, subtitle, children, onClose }) {
    const [closing, setClosing] = useState(false);

    const handleClose = useCallback(() => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => onClose(), ANIM_MS);
    }, [closing, onClose]);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === "Escape") handleClose(); };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [handleClose]);

    return (
        <>
            <div className={`modal-overlay ${closing ? "modal-out" : ""}`} onClick={handleClose} />
            <div className={`modal-container ${closing ? "modal-slide-out" : ""}`}>
                <div className="modal-header">
                    <div className="modal-title-row">
                        <h2 className="modal-title">{title}</h2>
                        <button className="modal-close" onClick={handleClose}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block', flexShrink: 0 }}>
                                <path d="M1 1L13 13M13 1L1 13" stroke="#666" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                    {subtitle && <p className="modal-subtitle">{subtitle}</p>}
                </div>
                <div className="modal-body">
                    {children}
                </div>

            </div>

            <style>{`
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.45);
                    z-index: 9998;
                    animation: modalFadeIn ${ANIM_MS}ms ease;
                }
                .modal-overlay.modal-out {
                    animation: modalFadeOut ${ANIM_MS}ms ease forwards;
                    /* While closing, the overlay is fading to opacity 0. It must
                       NOT keep swallowing clicks — if the unmount timer is delayed
                       (e.g. a backgrounded tab throttles setTimeout), an invisible
                       overlay left with pointer-events would block the whole page
                       and look like a hang. */
                    pointer-events: none;
                }
                .modal-container {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: #fff;
                    border-radius: 20px;
                    width: 92%;
                    max-width: 640px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    z-index: 9999;
                    animation: modalSlideIn ${ANIM_MS + 50}ms ease;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
                }
                .modal-container.modal-slide-out {
                    animation: modalSlideOut ${ANIM_MS}ms ease forwards;
                    pointer-events: none;
                }
                .modal-header {
                    padding: 28px 32px 16px;
                    border-bottom: 1px solid #e8e8e5;
                    flex-shrink: 0;
                    position: relative;
                    z-index: 1;
                }
                .modal-title-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .modal-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #1a1a1a;
                }
                .modal-close {
                    width: 36px;
                    height: 36px;
                    min-width: 36px;
                    min-height: 36px;
                    border-radius: 10px;
                    border: 1px solid #e8e8e5;
                    background: #f9f9f7;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #666;
                    transition: all 0.15s ease;
                    flex-shrink: 0;
                    overflow: visible;
                    position: relative;
                }
                .modal-close:hover {
                    background: #f0f0ee;
                    color: #333;
                }
                .modal-subtitle {
                    font-size: 13px;
                    color: #999;
                    margin-top: 6px;
                }
                .modal-body {
                    padding: 24px 32px;
                    overflow-y: auto;
                    /* min-height:0 lets this flex child shrink below its content
                       so overflow-y can actually scroll instead of overflowing
                       the (now capped) container. */
                    min-height: 0;
                    flex: 1;
                    line-height: 1.75;
                }
                .modal-body h2 {
                    font-size: 15px;
                    font-weight: 700;
                    color: #1a1a1a;
                    margin-top: 24px;
                    margin-bottom: 10px;
                }
                .modal-body h2:first-child {
                    margin-top: 0;
                }
                .modal-body h3 {
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                    margin-top: 14px;
                    margin-bottom: 6px;
                }
                .modal-body p {
                    font-size: 13.5px;
                    color: #444;
                    margin-bottom: 10px;
                    line-height: 1.8;
                }
                .modal-body ul {
                    padding-left: 22px;
                    margin-bottom: 10px;
                }
                .modal-body li {
                    font-size: 13.5px;
                    color: #444;
                    margin-bottom: 6px;
                    line-height: 1.7;
                }
                .modal-body strong {
                    color: #333;
                }
                .modal-body::-webkit-scrollbar {
                    width: 6px;
                }
                .modal-body::-webkit-scrollbar-track {
                    background: transparent;
                }
                .modal-body::-webkit-scrollbar-thumb {
                    background: #ddd;
                    border-radius: 3px;
                }
                .modal-body::-webkit-scrollbar-thumb:hover {
                    background: #ccc;
                }

                @keyframes modalFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes modalFadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
                @keyframes modalSlideIn {
                    from { opacity: 0; transform: translate(-50%, -48%); }
                    to { opacity: 1; transform: translate(-50%, -50%); }
                }
                @keyframes modalSlideOut {
                    from { opacity: 1; transform: translate(-50%, -50%); }
                    to { opacity: 0; transform: translate(-50%, -48%); }
                }
                @media (max-width: 600px) {
                    .modal-container {
                        width: 96%;
                        max-height: 90vh;
                        border-radius: 16px;
                    }
                    .modal-header {
                        padding: 20px 20px 14px;
                    }
                    .modal-body {
                        padding: 20px;
                    }

                }
            `}</style>
        </>
    );
}
